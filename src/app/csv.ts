/**
 * Génération du CSV consommé par le bot Discord.
 *
 * Le bot lit le fichier avec `csv-parse` et le séparateur `;`, en s'appuyant sur
 * le guillemet RFC 4180 par défaut : les champs échappés ici sont donc relus
 * correctement de l'autre côté.
 */

/** Séparateur attendu par le bot Discord. */
export const CSV_DELIMITER = ';';

/** Marque d'ordre des octets : sans elle, Excel ouvre le fichier avec des accents cassés. */
export const UTF8_BOM = '﻿';

const NEEDS_QUOTING = new RegExp(`["\\r\\n${CSV_DELIMITER}]`);

/**
 * Échappe un champ selon RFC 4180 : encadré de guillemets s'il contient le
 * séparateur, un guillemet ou un saut de ligne, les guillemets internes étant doublés.
 *
 * Sans cela un nom contenant `;` décalait toutes les colonnes de sa ligne et le bot
 * lisait n'importe quoi.
 */
export function escapeCsvField(value: string | null | undefined): string {
  const field = value ?? '';
  return NEEDS_QUOTING.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/** Assemble une ligne CSV à partir de champs bruts. */
export function toCsvRow(fields: readonly (string | null | undefined)[]): string {
  return fields.map(escapeCsvField).join(CSV_DELIMITER);
}

/** Assemble un document CSV complet, précédé du BOM UTF-8. */
export function toCsvDocument(rows: readonly (readonly (string | null | undefined)[])[]): string {
  return UTF8_BOM + rows.map(toCsvRow).join('\n') + (rows.length ? '\n' : '');
}
