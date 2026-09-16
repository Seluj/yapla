import { describe, expect, it } from 'vitest';

import { UTF8_BOM, escapeCsvField, toCsvDocument, toCsvRow } from './csv';

describe('escapeCsvField', () => {
  it('laisse les champs simples intacts', () => {
    expect(escapeCsvField('Dupont')).toBe('Dupont');
    expect(escapeCsvField('Jean-Éric')).toBe('Jean-Éric');
  });

  it('protège le séparateur, qui décalait toutes les colonnes de la ligne', () => {
    expect(escapeCsvField('Dupont; Marie')).toBe('"Dupont; Marie"');
  });

  it('double les guillemets internes', () => {
    expect(escapeCsvField('Jean "Jo" Dupont')).toBe('"Jean ""Jo"" Dupont"');
  });

  it('protège les sauts de ligne', () => {
    expect(escapeCsvField('Dupont\nMarie')).toBe('"Dupont\nMarie"');
    expect(escapeCsvField('Dupont\r\nMarie')).toBe('"Dupont\r\nMarie"');
  });

  it('traite les valeurs absentes comme des champs vides', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });
});

describe('toCsvRow', () => {
  it('assemble les champs avec le séparateur point-virgule', () => {
    expect(toCsvRow(['DUPONT', 'Marie', '2025-09-01', '2026-08-31'])).toBe(
      'DUPONT;Marie;2025-09-01;2026-08-31',
    );
  });

  it('échappe chaque champ indépendamment', () => {
    expect(toCsvRow(['DU;PONT', 'Marie', '', ''])).toBe('"DU;PONT";Marie;;');
  });
});

describe('toCsvDocument', () => {
  it('préfixe le document du BOM UTF-8 pour Excel', () => {
    const document = toCsvDocument([['a', 'b']]);

    expect(document.startsWith(UTF8_BOM)).toBe(true);
    expect(document).toBe(`${UTF8_BOM}a;b\n`);
  });

  it('ne produit que le BOM pour un document vide', () => {
    expect(toCsvDocument([])).toBe(UTF8_BOM);
  });
});
