import { Component, computed, signal } from '@angular/core';

import {
  Adherent,
  ExtractionReport,
  SheetRow,
  buildCsv,
  extractAdherents,
  isValidatedStatus,
} from './adherent';
import { formatDate, parseDate } from './date-utils';
import {
  ColumnMapping,
  EMPTY_MAPPING,
  MAPPING_FIELDS,
  MappingField,
  isMappingComplete,
  suggestMapping,
} from './mapping';
import { UploadError, loadBotToken, saveBotToken, sendCsvToBot } from './bot-api';
import { loadMapping, saveMapping } from './mapping-storage';
import { formatCellValue } from './text';

/**
 * Options de lecture SheetJS.
 *
 * `raw` est indispensable sur les fichiers CSV : sans lui, SheetJS interprète
 * lui-même les cellules ressemblant à des dates avec la convention **américaine**,
 * avant même que le fichier n'atteigne notre analyseur. « 01/09/2025 » devenait
 * ainsi le 9 janvier, tandis que « 15/03/2026 » restait du texte — une corruption
 * silencieuse et, en prime, incohérente d'une ligne à l'autre.
 *
 * `cellDates` demande à SheetJS de décoder lui-même les vraies cellules date des
 * classeurs Excel en objets `Date`, plutôt que de nous laisser reconstruire une
 * date à partir d'un numéro de série et de sa fraction horaire.
 */
const READ_OPTIONS = { raw: true, cellDates: true } as const;

/** Nombre de lignes affichées dans l'aperçu. */
const PREVIEW_ROWS = 10;

/** Nombre de lignes rejetées détaillées dans le compte rendu. */
const REJECTED_SAMPLE = 10;

/** État de l'envoi vers le bot, pour le retour affiché à l'utilisateur. */
type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; rows: number }
  | { kind: 'failed'; message: string };

/** Une ligne de l'aperçu, avec les dates telles qu'elles seront interprétées. */
interface PreviewRow {
  line: number;
  nom: string;
  prenom: string;
  debut: string;
  fin: string;
  debutParsed: string;
  finParsed: string;
  /** Valeur brute du statut, vide si aucune colonne de statut n'est associée. */
  statut: string;
  /** Faux lorsque la ligne sera écartée de l'export, quelle qu'en soit la raison. */
  valid: boolean;
}

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly mappingFields = MAPPING_FIELDS;
  readonly previewLimit = PREVIEW_ROWS;
  readonly rejectedSample = REJECTED_SAMPLE;

  readonly fileName = signal<string | null>(null);
  readonly headers = signal<readonly string[]>([]);
  readonly rows = signal<readonly SheetRow[]>([]);
  readonly mapping = signal<ColumnMapping>(EMPTY_MAPPING);
  readonly exportPath = signal('adherent.csv');
  readonly parseError = signal<string | null>(null);
  readonly loading = signal(false);

  /** Compte rendu du dernier export, affiché sous le bouton. */
  readonly report = signal<ExtractionReport | null>(null);

  /** Jeton d'API du bot, conservé d'une visite à l'autre. */
  readonly botToken = signal(loadBotToken());

  /** Résultat du dernier envoi vers le bot. */
  readonly sendState = signal<SendState>({ kind: 'idle' });

  readonly canExport = computed(() => this.rows().length > 0 && isMappingComplete(this.mapping()));

  /** L'envoi exige, en plus d'un export possible, un jeton saisi. */
  readonly canSend = computed(
    () =>
      this.canExport() && this.botToken().trim().length > 0 && this.sendState().kind !== 'sending',
  );

  /**
   * Vrai lorsqu'aucune colonne de statut n'est associée : toutes les adhésions
   * seront exportées, y compris les annulées et les expirées.
   */
  readonly statusFilterDisabled = computed(
    () => this.headers().length > 0 && !this.mapping().statusCol,
  );

  /**
   * Aperçu des premières lignes telles qu'elles seront exportées, dates comprises :
   * c'est le seul endroit où l'utilisateur peut vérifier que l'association des
   * colonnes et la lecture des dates correspondent bien à son fichier.
   */
  readonly preview = computed<readonly PreviewRow[]>(() => {
    const mapping = this.mapping();
    if (!isMappingComplete(mapping)) return [];

    return this.rows()
      .slice(0, PREVIEW_ROWS)
      .map((row, index) => {
        const debut = row[mapping.adhesionStartCol!];
        const fin = row[mapping.adhesionEndCol!];
        const debutParsed = parseDate(debut);
        const finParsed = parseDate(fin);
        const nom = this.asText(row[mapping.lastNameCol!]);
        const prenom = this.asText(row[mapping.firstNameCol!]);
        const statusOk = !mapping.statusCol || isValidatedStatus(row[mapping.statusCol]);
        return {
          line: index + 2,
          nom,
          prenom,
          debut: formatCellValue(debut),
          fin: formatCellValue(fin),
          debutParsed: formatDate(debutParsed),
          finParsed: formatDate(finParsed),
          statut: mapping.statusCol ? formatCellValue(row[mapping.statusCol]) : '',
          valid: statusOk && !!nom && !!prenom && !!debutParsed && !!finParsed,
        };
      });
  });

  /** Lignes rejetées à détailler dans le compte rendu. */
  readonly rejectedPreview = computed(
    () => this.report()?.rejected.slice(0, REJECTED_SAMPLE) ?? [],
  );

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.handleFile(file);
  }

  onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void this.handleFile(file);
  }

  onColumnChange(field: MappingField, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const mapping: ColumnMapping = { ...this.mapping(), [field]: value || null };
    this.mapping.set(mapping);
    this.report.set(null);
    if (this.headers().length) saveMapping(this.headers(), mapping);
  }

  async handleFile(file: File): Promise<void> {
    this.loading.set(true);
    this.parseError.set(null);
    this.report.set(null);
    this.sendState.set({ kind: 'idle' });

    try {
      const XLSX = await import('xlsx');
      const isCsv =
        file.name.toLowerCase().endsWith('.csv') || (file.type?.includes('csv') ?? false);
      const workbook = isCsv
        ? XLSX.read(await file.text(), { type: 'string', ...READ_OPTIONS })
        : XLSX.read(await file.arrayBuffer(), { type: 'array', ...READ_OPTIONS });

      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('Classeur sans feuille.');

      const rows = XLSX.utils.sheet_to_json<SheetRow>(workbook.Sheets[firstSheetName], {
        defval: '',
      });

      const headerSet = new Set<string>();
      for (const row of rows) for (const key of Object.keys(row)) headerSet.add(key);
      const headers = [...headerSet];

      // SheetJS n'échoue pas sur un fichier illisible : il renvoie une feuille vide.
      // Sans ce contrôle, l'utilisateur verrait « 0 ligne chargée » et plus rien.
      if (!rows.length || !headers.length) {
        throw new Error('Aucune ligne exploitable dans la première feuille.');
      }

      this.fileName.set(file.name);
      this.rows.set(rows);
      this.headers.set(headers);
      // La suggestion sert de base ; les choix enregistrés la recouvrent champ par champ.
      this.mapping.set({ ...suggestMapping(headers), ...loadMapping(headers) });
    } catch (error) {
      console.error(error);
      this.parseError.set(
        "Échec de la lecture du fichier : aucune donnée exploitable n'a été trouvée. " +
          "Vérifiez qu'il s'agit bien d'un export Yapla valide (.xlsx, .xls ou .csv) " +
          "dont la première feuille contient une ligne d'en-têtes.",
      );
      this.fileName.set(null);
      this.headers.set([]);
      this.rows.set([]);
      this.mapping.set(EMPTY_MAPPING);
    } finally {
      this.loading.set(false);
    }
  }

  onTokenChange(event: Event): void {
    const token = (event.target as HTMLInputElement).value;
    this.botToken.set(token);
    saveBotToken(token);
    this.sendState.set({ kind: 'idle' });
  }

  exportData(): void {
    if (!this.canExport()) return;

    const report = extractAdherents(this.rows(), this.mapping());
    this.report.set(report);
    this.download(buildCsv(report.adherents), this.exportPath());
  }

  /**
   * Envoie le CSV au bot sans passer par le téléchargement ni par `/upload`.
   *
   * Le compte rendu d'extraction est produit et affiché comme pour un export
   * classique : on ne dépose rien dans le bot sans que l'utilisateur ait vu ce
   * que contient le fichier envoyé.
   */
  async sendToBot(): Promise<void> {
    if (!this.canSend()) return;

    const report = extractAdherents(this.rows(), this.mapping());
    this.report.set(report);
    this.sendState.set({ kind: 'sending' });

    try {
      const result = await sendCsvToBot(buildCsv(report.adherents), this.botToken());
      this.sendState.set({ kind: 'sent', rows: result.rows });
    } catch (error) {
      const message =
        error instanceof UploadError ? error.message : "Échec de l'envoi vers le bot.";
      this.sendState.set({ kind: 'failed', message });
    }
  }

  /** Libellé lisible d'un adhérent trop long pour Discord. */
  describe(adherent: Adherent): string {
    return adherent.toString();
  }

  private asText(value: unknown): string {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  private download(content: string, fileName: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}
