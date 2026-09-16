import { ColumnMapping, MAPPING_FIELDS } from './mapping';

/**
 * Persistance du mapping dans `localStorage`, indexée par jeu d'en-têtes.
 *
 * Tous les accès sont protégés : Safari en navigation privée, et un navigateur dont
 * le stockage est désactivé ou saturé, lèvent une exception qui cassait auparavant
 * le chargement du fichier.
 */

const KEY_PREFIX = 'mapping:';

export function mappingStorageKey(headers: readonly string[]): string {
  return KEY_PREFIX + [...headers].sort().join('|');
}

/**
 * Lit un mapping enregistré, ou `null` s'il est absent, illisible, ou si le stockage
 * est indisponible.
 *
 * Seuls les champs réellement présents dans l'enregistrement sont renvoyés. Un champ
 * absent — le cas des mappings enregistrés avant l'ajout de la colonne de statut —
 * laisse la détection automatique reprendre la main, tandis qu'un champ présent mais
 * `null` traduit un choix de l'utilisateur, qui est respecté.
 */
export function loadMapping(headers: readonly string[]): Partial<ColumnMapping> | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(mappingStorageKey(headers));
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const stored = parsed as Partial<Record<keyof ColumnMapping, unknown>>;
  const mapping: Partial<ColumnMapping> = {};
  for (const { key } of MAPPING_FIELDS) {
    if (!(key in stored)) continue;
    const value = stored[key];
    if (value === null) {
      mapping[key] = null;
    } else if (typeof value === 'string' && headers.includes(value)) {
      mapping[key] = value;
    }
    // Une colonne enregistrée qui n'existe plus dans le fichier est omise : la
    // détection automatique en proposera une autre.
  }
  return mapping;
}

/** Enregistre le mapping ; une erreur de stockage est sans conséquence pour l'export. */
export function saveMapping(headers: readonly string[], mapping: ColumnMapping): void {
  try {
    localStorage.setItem(mappingStorageKey(headers), JSON.stringify(mapping));
  } catch {
    // Stockage indisponible (navigation privée, quota) : le mapping reste en mémoire.
  }
}
