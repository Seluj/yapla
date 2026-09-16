/**
 * Normalisation des libellés et des valeurs de cellule.
 *
 * Minuscules, accents retirés, ponctuation ramenée à des espaces simples :
 * `Fin d'adhésion` → `fin d adhesion`, `Validée` → `validee`. Cela permet de
 * comparer des en-têtes mot à mot et des statuts sans dépendre de la casse,
 * des accents ni de la ponctuation.
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Rend une valeur de cellule lisible pour l'affichage.
 *
 * SheetJS renvoie un objet `Date` pour les vraies cellules date des classeurs Excel,
 * dont la conversion implicite en chaîne donne
 * `Tue Oct 25 2022 00:00:00 GMT+0200 (heure d'été d'Europe centrale)` — inexploitable
 * dans un tableau. On affiche alors la date de calendrier telle que le tableur la
 * présente, en `JJ/MM/AAAA`.
 */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${value.getFullYear()}`;
  }

  return String(value).trim();
}
