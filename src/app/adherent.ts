import { toCsvDocument, toCsvRow } from './csv';
import { formatDate, parseDate, todayAsCalendarDate } from './date-utils';
import { ColumnMapping } from './mapping';
import { formatCellValue, normalizeText } from './text';

/** Longueur maximale d'un pseudo Discord. */
export const DISCORD_NAME_LIMIT = 32;

/** Une ligne du fichier déposé, telle que produite par SheetJS. */
export type SheetRow = Record<string, unknown>;

/**
 * Valeurs de « Statut d'adhésion » considérées comme validées, sous forme normalisée.
 *
 * Un export Yapla porte aussi « Expirée », « Annulée », « En attente de paiement » et
 * « En attente de validation », qui ne doivent pas être exportées.
 */
const VALIDATED_STATUSES = new Set(['validee', 'valide', 'validated', 'valid']);

/** Vrai lorsque la valeur de statut désigne une adhésion validée. */
export function isValidatedStatus(value: unknown): boolean {
  return VALIDATED_STATUSES.has(normalizeText(String(value ?? '')));
}

/** Séparateur de clé de déduplication ; ce caractère ne peut pas apparaître dans un nom. */
const KEY_SEPARATOR = '';

export class Adherent {
  constructor(
    readonly nom: string,
    readonly prenom: string,
    readonly debutAdhesion: Date,
    readonly finAdhesion: Date,
  ) {}

  /** Clé de déduplication (nom, prénom). */
  key(): string {
    return `${this.nom}${KEY_SEPARATOR}${this.prenom}`;
  }

  isTooLongForDiscord(): boolean {
    return this.nom.length + this.prenom.length > DISCORD_NAME_LIMIT;
  }

  isActiveOn(date: Date): boolean {
    return this.debutAdhesion <= date && this.finAdhesion >= date;
  }

  toString(): string {
    return `${this.nom} ${this.prenom} : ${formatDate(this.debutAdhesion)} - ${formatDate(this.finAdhesion)}`;
  }

  toCsv(): string {
    return toCsvRow([
      this.nom,
      this.prenom,
      formatDate(this.debutAdhesion),
      formatDate(this.finAdhesion),
    ]);
  }
}

/** Une ligne écartée, conservée pour pouvoir l'expliquer à l'utilisateur. */
export interface RejectedRow {
  /** Numéro de ligne dans le fichier, en-tête comprise. */
  line: number;
  reason: 'nom-manquant' | 'date-illisible';
  nom: string;
  prenom: string;
  debut: string;
  fin: string;
}

export interface ExtractionReport {
  /** Adhérents actifs, dédupliqués, triés par date de début. */
  adherents: Adherent[];
  totalRows: number;
  /**
   * Vrai lorsqu'une colonne « Statut d'adhésion » était associée et a donc été
   * appliquée. Faux : toutes les adhésions ont été retenues, quel que soit leur statut.
   */
  statusFiltered: boolean;
  /** Lignes écartées parce que leur statut d'adhésion n'est pas « Validée ». */
  notValidatedCount: number;
  /** Lignes écartées faute de nom, de prénom ou de date exploitable. */
  rejected: RejectedRow[];
  /** Lignes valides mais hors période d'adhésion à la date du jour. */
  inactiveCount: number;
  /** Doublons (nom, prénom) fusionnés ; l'adhésion la plus ancienne est conservée. */
  duplicateCount: number;
  /** Adhérents dont `nom + prénom` dépasse la limite Discord. */
  tooLongForDiscord: Adherent[];
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Transforme les lignes du fichier en adhérents actifs et dédupliqués.
 *
 * Contrairement à la version précédente, aucune ligne n'est écartée en silence :
 * chaque rejet est enregistré dans `rejected` pour pouvoir être affiché. Une date
 * française mal interprétée provoquait auparavant la disparition pure et simple de
 * l'adhérent de l'export.
 */
export function extractAdherents(
  rows: readonly SheetRow[],
  mapping: ColumnMapping,
  now: Date = new Date(),
): ExtractionReport {
  const today = todayAsCalendarDate(now);
  const statusCol = mapping.statusCol;
  const parsed: Adherent[] = [];
  const rejected: RejectedRow[] = [];
  let notValidatedCount = 0;

  rows.forEach((row, index) => {
    // Le statut est évalué en premier : une adhésion annulée ou expirée est hors
    // sujet, et il serait trompeur de la signaler en plus comme une ligne mal remplie.
    if (statusCol && !isValidatedStatus(row[statusCol])) {
      notValidatedCount += 1;
      return;
    }

    const nom = asText(row[mapping.lastNameCol!]);
    const prenom = asText(row[mapping.firstNameCol!]);
    const rawDebut = row[mapping.adhesionStartCol!];
    const rawFin = row[mapping.adhesionEndCol!];

    const describe = (reason: RejectedRow['reason']): RejectedRow => ({
      // +2 : les lignes sont numérotées à partir de 1 et la première porte les en-têtes.
      line: index + 2,
      reason,
      nom,
      prenom,
      debut: formatCellValue(rawDebut),
      fin: formatCellValue(rawFin),
    });

    if (!nom || !prenom) {
      rejected.push(describe('nom-manquant'));
      return;
    }

    const debut = parseDate(rawDebut);
    const fin = parseDate(rawFin);
    if (!debut || !fin) {
      rejected.push(describe('date-illisible'));
      return;
    }

    parsed.push(new Adherent(nom, prenom, debut, fin));
  });

  const active = parsed.filter((adherent) => adherent.isActiveOn(today));

  const bestByKey = new Map<string, Adherent>();
  for (const adherent of active) {
    const previous = bestByKey.get(adherent.key());
    if (!previous || adherent.debutAdhesion < previous.debutAdhesion) {
      bestByKey.set(adherent.key(), adherent);
    }
  }

  const adherents = [...bestByKey.values()].sort(
    (a, b) =>
      a.debutAdhesion.getTime() - b.debutAdhesion.getTime() ||
      a.nom.localeCompare(b.nom, 'fr') ||
      a.prenom.localeCompare(b.prenom, 'fr'),
  );

  return {
    adherents,
    totalRows: rows.length,
    statusFiltered: !!statusCol,
    notValidatedCount,
    rejected,
    inactiveCount: parsed.length - active.length,
    duplicateCount: active.length - adherents.length,
    tooLongForDiscord: adherents.filter((adherent) => adherent.isTooLongForDiscord()),
  };
}

/**
 * Sérialise les adhérents au format attendu par le bot Discord : séparateur `;`,
 * sans ligne d'en-tête, précédé d'une ligne technique portant la date de génération.
 */
export function buildCsv(adherents: readonly Adherent[], now: Date = new Date()): string {
  const generatedOn = formatDate(todayAsCalendarDate(now));
  const header = ['Base de données', 'Base de données', generatedOn, generatedOn];
  const body = adherents.map((adherent) => [
    adherent.nom,
    adherent.prenom,
    formatDate(adherent.debutAdhesion),
    formatDate(adherent.finAdhesion),
  ]);
  return toCsvDocument([header, ...body]);
}
