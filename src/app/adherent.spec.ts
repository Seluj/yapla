import { describe, expect, it } from 'vitest';

import { Adherent, SheetRow, buildCsv, extractAdherents, isValidatedStatus } from './adherent';
import { UTF8_BOM } from './csv';
import { makeCalendarDate } from './date-utils';
import { ColumnMapping } from './mapping';

const MAPPING: ColumnMapping = {
  firstNameCol: 'Prénom',
  lastNameCol: 'Nom',
  adhesionStartCol: 'Début',
  adhesionEndCol: 'Fin',
  statusCol: null,
};

/** Date de référence pour « actif aujourd'hui » dans toute la suite. */
const NOW = new Date(2026, 0, 15, 12, 0);

function row(nom: string, prenom: string, debut: unknown, fin: unknown, statut = ''): SheetRow {
  return { Nom: nom, Prénom: prenom, Début: debut, Fin: fin, Statut: statut };
}

/** Le même mapping, mais avec le filtre sur le statut d'adhésion activé. */
const MAPPING_WITH_STATUS: ColumnMapping = { ...MAPPING, statusCol: 'Statut' };

function date(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return makeCalendarDate(year, month, day)!;
}

describe('extractAdherents', () => {
  it('conserve les adhérents dont les dates sont écrites à la française', () => {
    // Régression : « 15/09/2025 » devenait Invalid Date et l'adhérent disparaissait
    // silencieusement de l'export.
    const report = extractAdherents(
      [row('DUPONT', 'Marie', '15/09/2025', '31/08/2026')],
      MAPPING,
      NOW,
    );

    expect(report.rejected).toHaveLength(0);
    expect(report.adherents).toHaveLength(1);
    expect(report.adherents[0].toCsv()).toBe('DUPONT;Marie;2025-09-15;2026-08-31');
  });

  it('signale les lignes écartées au lieu de les ignorer', () => {
    const report = extractAdherents(
      [
        row('DUPONT', 'Marie', '01/09/2025', '31/08/2026'),
        row('MARTIN', 'Luc', 'la semaine prochaine', '31/08/2026'),
        row('', 'Sans nom', '01/09/2025', '31/08/2026'),
      ],
      MAPPING,
      NOW,
    );

    expect(report.totalRows).toBe(3);
    expect(report.adherents).toHaveLength(1);
    expect(report.rejected).toEqual([
      expect.objectContaining({ line: 3, reason: 'date-illisible', nom: 'MARTIN' }),
      expect.objectContaining({ line: 4, reason: 'nom-manquant', prenom: 'Sans nom' }),
    ]);
  });

  it('écarte les adhésions non actives à la date du jour et les compte', () => {
    const report = extractAdherents(
      [
        row('ACTIF', 'Ana', '01/09/2025', '31/08/2026'),
        row('EXPIRE', 'Bob', '01/09/2023', '31/08/2024'),
        row('FUTUR', 'Cid', '01/09/2027', '31/08/2028'),
      ],
      MAPPING,
      NOW,
    );

    expect(report.adherents.map((a) => a.nom)).toEqual(['ACTIF']);
    expect(report.inactiveCount).toBe(2);
  });

  it('inclut les adhésions dont la période commence ou se termine aujourd’hui', () => {
    const report = extractAdherents(
      [
        row('DEBUT', 'Ana', '15/01/2026', '31/08/2026'),
        row('FIN', 'Bob', '01/09/2025', '15/01/2026'),
      ],
      MAPPING,
      NOW,
    );

    expect(report.adherents.map((a) => a.nom).sort()).toEqual(['DEBUT', 'FIN']);
    expect(report.inactiveCount).toBe(0);
  });

  it('déduplique sur (nom, prénom) en gardant l’adhésion la plus ancienne', () => {
    const report = extractAdherents(
      [
        row('DUPONT', 'Marie', '01/10/2025', '31/08/2026'),
        row('DUPONT', 'Marie', '01/09/2025', '31/08/2026'),
        row('DUPONT', 'Paul', '01/09/2025', '31/08/2026'),
      ],
      MAPPING,
      NOW,
    );

    expect(report.duplicateCount).toBe(1);
    expect(report.adherents).toHaveLength(2);
    const marie = report.adherents.find((a) => a.prenom === 'Marie')!;
    expect(marie.debutAdhesion).toEqual(date('2025-09-01'));
  });

  it('nettoie les espaces superflus des noms', () => {
    const report = extractAdherents(
      [row('  DUPONT  ', '  Marie  ', '01/09/2025', '31/08/2026')],
      MAPPING,
      NOW,
    );

    expect(report.adherents[0].nom).toBe('DUPONT');
    expect(report.adherents[0].prenom).toBe('Marie');
  });

  it('signale les noms trop longs pour Discord', () => {
    const report = extractAdherents(
      [
        row('DUPONT', 'Marie', '01/09/2025', '31/08/2026'),
        row('VANDENBERGHE-DELACROIX', 'Marie-Alexandrine', '01/09/2025', '31/08/2026'),
      ],
      MAPPING,
      NOW,
    );

    expect(report.tooLongForDiscord.map((a) => a.nom)).toEqual(['VANDENBERGHE-DELACROIX']);
  });

  it('trie par date de début', () => {
    const report = extractAdherents(
      [row('B', 'Bob', '01/10/2025', '31/08/2026'), row('A', 'Ana', '01/09/2025', '31/08/2026')],
      MAPPING,
      NOW,
    );

    expect(report.adherents.map((a) => a.nom)).toEqual(['A', 'B']);
  });
});

describe("filtrage sur le statut d'adhésion", () => {
  const rows = [
    row('VALIDE', 'Ana', '01/09/2025', '31/08/2026', 'Validée'),
    row('EXPIRE', 'Bob', '01/09/2025', '31/08/2026', 'Expirée'),
    row('ANNULE', 'Cid', '01/09/2025', '31/08/2026', 'Annulée'),
    row('PAIEMENT', 'Dan', '01/09/2025', '31/08/2026', 'En attente de paiement'),
    row('VALIDATION', 'Eve', '01/09/2025', '31/08/2026', 'En attente de validation'),
  ];

  it('ne retient que les adhésions validées quand la colonne est associée', () => {
    const report = extractAdherents(rows, MAPPING_WITH_STATUS, NOW);

    expect(report.adherents.map((a) => a.nom)).toEqual(['VALIDE']);
    expect(report.statusFiltered).toBe(true);
    expect(report.notValidatedCount).toBe(4);
  });

  it('retient tout le monde quand la colonne n’est pas associée', () => {
    const report = extractAdherents(rows, MAPPING, NOW);

    expect(report.adherents).toHaveLength(5);
    expect(report.statusFiltered).toBe(false);
    expect(report.notValidatedCount).toBe(0);
  });

  it('ignore la casse et les accents du statut', () => {
    const report = extractAdherents(
      [
        row('A', 'Ana', '01/09/2025', '31/08/2026', 'VALIDÉE'),
        row('B', 'Bob', '01/09/2025', '31/08/2026', '  validee  '),
        row('C', 'Cid', '01/09/2025', '31/08/2026', 'Validé'),
      ],
      MAPPING_WITH_STATUS,
      NOW,
    );

    expect(report.adherents).toHaveLength(3);
  });

  it('écarte une ligne au statut vide ou inconnu', () => {
    const report = extractAdherents(
      [
        row('VIDE', 'Ana', '01/09/2025', '31/08/2026', ''),
        row('INCONNU', 'Bob', '01/09/2025', '31/08/2026', 'Brouillon'),
      ],
      MAPPING_WITH_STATUS,
      NOW,
    );

    expect(report.adherents).toHaveLength(0);
    expect(report.notValidatedCount).toBe(2);
  });

  it('ne signale pas comme mal remplie une ligne écartée par son statut', () => {
    // Le statut prime : une adhésion annulée est hors sujet, la signaler en plus
    // comme « date illisible » noierait les vraies anomalies.
    const report = extractAdherents(
      [row('', '', 'bientôt', '', 'Annulée')],
      MAPPING_WITH_STATUS,
      NOW,
    );

    expect(report.rejected).toHaveLength(0);
    expect(report.notValidatedCount).toBe(1);
  });

  it('n’ajoute pas le statut au CSV produit', () => {
    const report = extractAdherents(rows, MAPPING_WITH_STATUS, NOW);

    expect(buildCsv(report.adherents, NOW)).toBe(
      `${UTF8_BOM}Base de données;Base de données;2026-01-15;2026-01-15\nVALIDE;Ana;2025-09-01;2026-08-31\n`,
    );
  });
});

describe('isValidatedStatus', () => {
  it('reconnaît les libellés validés', () => {
    for (const value of ['Validée', 'validee', 'Validé', 'VALIDE', ' Validée ']) {
      expect(isValidatedStatus(value)).toBe(true);
    }
  });

  it('rejette tous les autres statuts Yapla', () => {
    for (const value of [
      'Expirée',
      'Annulée',
      'En attente de paiement',
      'En attente de validation',
      '',
      null,
      undefined,
    ]) {
      expect(isValidatedStatus(value)).toBe(false);
    }
  });
});

describe('Adherent', () => {
  const adherent = new Adherent('DUPONT', 'Marie', date('2025-09-01'), date('2026-08-31'));

  it('échappe les champs contenant le séparateur', () => {
    const risky = new Adherent('DU;PONT', 'Ma"rie', date('2025-09-01'), date('2026-08-31'));

    expect(risky.toCsv()).toBe('"DU;PONT";"Ma""rie";2025-09-01;2026-08-31');
  });

  it('mesure la longueur du nom Discord', () => {
    expect(adherent.isTooLongForDiscord()).toBe(false);
    expect(
      new Adherent(
        'A'.repeat(30),
        'B'.repeat(3),
        date('2025-09-01'),
        date('2026-08-31'),
      ).isTooLongForDiscord(),
    ).toBe(true);
  });

  it('produit un libellé lisible', () => {
    expect(adherent.toString()).toBe('DUPONT Marie : 2025-09-01 - 2026-08-31');
  });
});

describe('buildCsv', () => {
  it('produit le format attendu par le bot Discord', () => {
    const adherents = [new Adherent('DUPONT', 'Marie', date('2025-09-01'), date('2026-08-31'))];

    expect(buildCsv(adherents, NOW)).toBe(
      `${UTF8_BOM}Base de données;Base de données;2026-01-15;2026-01-15\nDUPONT;Marie;2025-09-01;2026-08-31\n`,
    );
  });

  it('écrit la ligne technique même sans adhérent', () => {
    expect(buildCsv([], NOW)).toBe(
      `${UTF8_BOM}Base de données;Base de données;2026-01-15;2026-01-15\n`,
    );
  });
});
