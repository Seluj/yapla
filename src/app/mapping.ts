import { normalizeText } from './text';

/** Association entre les champs attendus et les colonnes du fichier déposé. */
export interface ColumnMapping {
  firstNameCol: string | null;
  lastNameCol: string | null;
  adhesionStartCol: string | null;
  adhesionEndCol: string | null;
  /**
   * Colonne « Statut d'adhésion », facultative. Lorsqu'elle est associée, seules
   * les adhésions validées sont exportées. Elle sert uniquement de filtre et
   * n'apparaît jamais dans le CSV produit.
   */
  statusCol: string | null;
}

export type MappingField = keyof ColumnMapping;

export const EMPTY_MAPPING: ColumnMapping = {
  firstNameCol: null,
  lastNameCol: null,
  adhesionStartCol: null,
  adhesionEndCol: null,
  statusCol: null,
};

export interface MappingFieldDescriptor {
  key: MappingField;
  label: string;
  /** Un champ facultatif peut rester vide sans bloquer l'export. */
  required: boolean;
  /** Texte d'aide affiché sous la liste déroulante. */
  hint?: string;
}

export const MAPPING_FIELDS: readonly MappingFieldDescriptor[] = [
  { key: 'firstNameCol', label: 'Prénom', required: true },
  { key: 'lastNameCol', label: 'Nom', required: true },
  { key: 'adhesionStartCol', label: "Début d'adhésion", required: true },
  { key: 'adhesionEndCol', label: "Fin d'adhésion", required: true },
  {
    key: 'statusCol',
    label: "Statut d'adhésion",
    required: false,
    hint: "Facultatif. Si renseigné, seules les adhésions validées sont exportées. Cette colonne n'apparaît pas dans le CSV.",
  },
];

/** Les champs sans lesquels l'export est impossible. */
export const REQUIRED_MAPPING_FIELDS: readonly MappingFieldDescriptor[] = MAPPING_FIELDS.filter(
  (field) => field.required,
);

interface FieldRule {
  /** En-tête normalisé identique — le signal le plus fort. */
  exact: readonly string[];
  /** Un mot de l'en-tête normalisé correspond. */
  words: readonly string[];
  /** Repli en sous-chaîne, pour les en-têtes collés du type `NomFamille`. */
  fragments: readonly string[];
  /** Sous-chaînes qui disqualifient l'en-tête pour ce champ. */
  excludes: readonly string[];
}

const EXACT_SCORE = 3;
const WORD_SCORE = 2;
const FRAGMENT_SCORE = 1;

const RULES: Readonly<Record<MappingField, FieldRule>> = {
  firstNameCol: {
    exact: ['prenom', 'first name', 'firstname', 'given name'],
    words: ['prenom', 'firstname', 'first'],
    fragments: ['prenom', 'firstname'],
    excludes: [],
  },
  lastNameCol: {
    // `prenom` contient `nom` : sans exclusion explicite, « Nom » était associé à
    // la colonne Prénom et le CSV exporté contenait le prénom en double.
    exact: ['nom', 'nom de famille', 'last name', 'lastname', 'surname', 'family name'],
    words: ['nom', 'famille', 'lastname', 'last', 'surname'],
    fragments: ['nomdefamille', 'nomfamille', 'lastname', 'surname'],
    excludes: ['prenom', 'surnom', 'pseudo', 'utilisateur', 'username', 'nombre', 'nomenclature'],
  },
  adhesionStartCol: {
    exact: ['debut', 'debut adhesion', 'date de debut', 'start', 'start date', 'date debut'],
    words: ['debut', 'start'],
    fragments: ['debut', 'startdate'],
    excludes: [],
  },
  adhesionEndCol: {
    exact: ['fin', 'fin adhesion', 'date de fin', 'expiration', 'end', 'end date', 'date fin'],
    words: ['fin', 'expiration', 'echeance', 'end'],
    fragments: ['expiration', 'echeance', 'enddate'],
    excludes: [],
  },
  statusCol: {
    exact: [
      'statut',
      'statut adhesion',
      'statut d adhesion',
      'statut de l adhesion',
      'adhesion statut d adhesion',
      'status',
    ],
    words: ['statut', 'status'],
    fragments: ['statutdadhesion', 'statutadhesion'],
    // Un export Yapla porte aussi une colonne « Membre - Statut » (Actif / Inactif /
    // Archivé), qui n'a rien à voir avec le statut de l'adhésion. La retenir par
    // erreur écarterait la totalité des lignes, aucune n'étant « Validée ».
    excludes: ['membre', 'member'],
  },
};

function scoreHeader(header: string, rule: FieldRule): number {
  const normalized = normalizeText(header);
  if (normalized === '') return 0;

  const collapsed = normalized.replace(/ /g, '');
  if (rule.excludes.some((token) => collapsed.includes(token))) return 0;

  if (rule.exact.includes(normalized)) return EXACT_SCORE;

  const words = normalized.split(' ');
  if (rule.words.some((token) => words.includes(token))) return WORD_SCORE;

  if (rule.fragments.some((token) => collapsed.includes(token))) return FRAGMENT_SCORE;

  return 0;
}

/**
 * Propose une association à partir des libellés d'en-tête.
 *
 * L'attribution est gloutonne sur le score décroissant, et une colonne déjà retenue
 * ne peut pas être proposée une seconde fois : deux champs ne peuvent donc plus
 * pointer sur la même colonne.
 */
export function suggestMapping(headers: readonly string[]): ColumnMapping {
  const candidates: { field: MappingField; header: string; score: number }[] = [];

  for (const { key } of MAPPING_FIELDS) {
    for (const header of headers) {
      const score = scoreHeader(header, RULES[key]);
      if (score > 0) candidates.push({ field: key, header, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const mapping: ColumnMapping = { ...EMPTY_MAPPING };
  const usedHeaders = new Set<string>();

  for (const candidate of candidates) {
    if (mapping[candidate.field] !== null || usedHeaders.has(candidate.header)) continue;
    mapping[candidate.field] = candidate.header;
    usedHeaders.add(candidate.header);
  }

  return mapping;
}

/** Vrai lorsque toutes les colonnes obligatoires sont renseignées. */
export function isMappingComplete(mapping: ColumnMapping): boolean {
  return REQUIRED_MAPPING_FIELDS.every(({ key }) => !!mapping[key]);
}
