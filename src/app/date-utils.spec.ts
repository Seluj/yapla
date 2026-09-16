import { describe, expect, it } from 'vitest';

import { formatDate, makeCalendarDate, parseDate, todayAsCalendarDate } from './date-utils';

describe('parseDate', () => {
  it('lit les dates françaises JJ/MM/AAAA', () => {
    // Régression : `new Date('03/04/2025')` renvoyait le 3 mars (sémantique US MM/DD).
    expect(formatDate(parseDate('03/04/2025'))).toBe('2025-04-03');
    expect(formatDate(parseDate('01/09/2025'))).toBe('2025-09-01');
  });

  it('lit les jours supérieurs à 12, qui devenaient Invalid Date', () => {
    expect(formatDate(parseDate('15/03/2025'))).toBe('2025-03-15');
    expect(formatDate(parseDate('31/12/2025'))).toBe('2025-12-31');
  });

  it('accepte les séparateurs - et . ainsi qu’une heure en suffixe', () => {
    expect(formatDate(parseDate('15-03-2025'))).toBe('2025-03-15');
    expect(formatDate(parseDate('15.03.2025'))).toBe('2025-03-15');
    expect(formatDate(parseDate('15/03/2025 14:32'))).toBe('2025-03-15');
  });

  it('lit les dates ISO', () => {
    expect(formatDate(parseDate('2025-09-01'))).toBe('2025-09-01');
    expect(formatDate(parseDate('2025/09/01'))).toBe('2025-09-01');
    expect(formatDate(parseDate('2025-09-01T10:00:00Z'))).toBe('2025-09-01');
  });

  it('applique le pivot habituel aux années sur deux chiffres', () => {
    expect(formatDate(parseDate('01/09/25'))).toBe('2025-09-01');
    expect(formatDate(parseDate('01/09/99'))).toBe('1999-09-01');
  });

  it('rejette les dates qui n’existent pas au lieu de les reporter', () => {
    expect(parseDate('31/02/2025')).toBeNull();
    expect(parseDate('00/01/2025')).toBeNull();
    expect(parseDate('01/13/2025')).toBeNull();
  });

  it('rejette les valeurs vides ou illisibles', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('   ')).toBeNull();
    expect(parseDate('bientôt')).toBeNull();
    expect(parseDate(new Date('nope'))).toBeNull();
    expect(parseDate({})).toBeNull();
  });

  it('convertit les numéros de série Excel', () => {
    // 45901 = 2025-09-01 dans le calendrier Excel (epoch 1899-12-30).
    expect(formatDate(parseDate(45901))).toBe('2025-09-01');
    expect(formatDate(parseDate('45901'))).toBe('2025-09-01');
    // La fraction porte l'heure : seule la date de calendrier est retenue.
    expect(formatDate(parseDate(45901.75))).toBe('2025-09-01');
  });

  it('rejette les numéros de série hors bornes plausibles', () => {
    expect(parseDate(0)).toBeNull();
    expect(parseDate(-5)).toBeNull();
    expect(parseDate(999999)).toBeNull();
  });

  it('conserve la date de calendrier d’une Date du tableur', () => {
    expect(formatDate(parseDate(new Date(2025, 8, 1)))).toBe('2025-09-01');
  });

  it('ne dépend pas du fuseau : minuit UTC sur toute l’année', () => {
    // Un calcul en heure locale glissait d'un jour aux transitions heure d'été.
    for (const iso of ['2025-03-30', '2025-10-26', '2025-01-01', '2025-07-15']) {
      const parsed = parseDate(iso)!;
      expect(parsed.getUTCHours()).toBe(0);
      expect(formatDate(parsed)).toBe(iso);
    }
  });
});

describe('makeCalendarDate', () => {
  it('refuse les composantes hors bornes', () => {
    expect(makeCalendarDate(2025, 0, 10)).toBeNull();
    expect(makeCalendarDate(2025, 13, 10)).toBeNull();
    expect(makeCalendarDate(2025, 2, 30)).toBeNull();
    expect(makeCalendarDate(99, 1, 1)).toBeNull();
  });

  it('accepte le 29 février d’une année bissextile', () => {
    expect(formatDate(makeCalendarDate(2024, 2, 29))).toBe('2024-02-29');
    expect(makeCalendarDate(2025, 2, 29)).toBeNull();
  });
});

describe('formatDate', () => {
  it('renvoie une chaîne vide pour une date absente ou invalide', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate(new Date('nope'))).toBe('');
  });

  it('complète les composantes sur deux chiffres', () => {
    expect(formatDate(makeCalendarDate(2025, 1, 5))).toBe('2025-01-05');
  });
});

describe('todayAsCalendarDate', () => {
  it('ramène le jour local à minuit UTC', () => {
    const today = todayAsCalendarDate(new Date(2025, 8, 16, 23, 30));
    expect(formatDate(today)).toBe('2025-09-16');
    expect(today.getUTCHours()).toBe(0);
  });
});
