/**
 * Dates de calendrier (sans heure) manipulées en UTC.
 *
 * Toutes les dates du projet sont des dates de calendrier pures : une adhésion
 * commence « le 1er septembre », pas « le 1er septembre à 00:00 heure de Paris ».
 * On les représente donc systématiquement par un instant UTC à minuit, et on les
 * formate avec les accesseurs UTC. Cela supprime toute dépendance au fuseau de la
 * machine et tout glissement d'un jour aux transitions heure d'été / heure d'hiver.
 */

/** Epoch des numéros de série Excel : 1899-12-30 (compense le bug de l'année bissextile 1900). */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Bornes de plausibilité pour un numéro de série Excel (1900-01-01 → 2199-12-31). */
const MIN_EXCEL_SERIAL = 1;
const MAX_EXCEL_SERIAL = 109574;

/** `YYYY-MM-DD` ou `YYYY/MM/DD` — année en premier. */
const ISO_LIKE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/;

/** `DD/MM/YYYY` ou `DD-MM-YY` — jour en premier (convention française). */
const FRENCH = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T ].*)?$/;

/** Suite de chiffres seule : numéro de série Excel exporté sous forme de texte. */
const DIGITS_ONLY = /^\d+$/;

/**
 * Construit une date de calendrier UTC, en rejetant les dates qui n'existent pas
 * (`31/02/2025` par exemple, que `Date` reporterait silencieusement au 3 mars).
 */
export function makeCalendarDate(year: number, month: number, day: number): Date | null {
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return roundTrips ? date : null;
}

/** La date du jour de l'utilisateur (calendrier local), ramenée à minuit UTC. */
export function todayAsCalendarDate(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Formate une date de calendrier en `YYYY-MM-DD`. */
export function formatDate(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Convertit un numéro de série Excel en date de calendrier, en arithmétique UTC. */
function fromExcelSerial(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null;
  const days = Math.floor(serial);
  if (days < MIN_EXCEL_SERIAL || days > MAX_EXCEL_SERIAL) return null;
  return new Date(EXCEL_EPOCH_UTC + days * MS_PER_DAY);
}

/** Année sur deux chiffres : pivot habituel 00-68 → 2000s, 69-99 → 1900s. */
function expandTwoDigitYear(value: number): number {
  return value <= 68 ? 2000 + value : 1900 + value;
}

/**
 * Analyse une valeur de cellule en date de calendrier, ou renvoie `null` si elle
 * est illisible.
 *
 * Les chaînes sont lues avec la convention **française** `JJ/MM/AAAA` : `new Date()`
 * appliquerait la sémantique américaine `MM/DD/YYYY`, ce qui décalait les dates
 * dont le jour est ≤ 12 et rendait invalides toutes les autres.
 *
 * Formats reconnus : `Date`, numéro de série Excel (nombre ou texte), `YYYY-MM-DD`,
 * `YYYY/MM/DD`, `JJ/MM/AAAA`, `JJ-MM-AAAA`, `JJ.MM.AA`, éventuellement suivis d'une
 * heure qui est ignorée.
 */
export function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // Une `Date` produite par le tableur porte la date voulue dans ses composantes locales.
    return makeCalendarDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number') return fromExcelSerial(value);

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed === '') return null;

  const isoLike = ISO_LIKE.exec(trimmed);
  if (isoLike) {
    return makeCalendarDate(Number(isoLike[1]), Number(isoLike[2]), Number(isoLike[3]));
  }

  const french = FRENCH.exec(trimmed);
  if (french) {
    const rawYear = Number(french[3]);
    const year = french[3].length === 2 ? expandTwoDigitYear(rawYear) : rawYear;
    return makeCalendarDate(year, Number(french[2]), Number(french[1]));
  }

  if (DIGITS_ONLY.test(trimmed)) return fromExcelSerial(Number(trimmed));

  return null;
}
