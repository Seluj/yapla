import { describe, expect, it } from 'vitest';

import { formatCellValue, normalizeText } from './text';

describe('normalizeText', () => {
  it('retire les accents et la ponctuation', () => {
    expect(normalizeText('Prénom')).toBe('prenom');
    expect(normalizeText("Fin d'adhésion")).toBe('fin d adhesion');
    expect(normalizeText('  Début_adhésion  ')).toBe('debut adhesion');
  });

  it('normalise aussi les valeurs de cellule', () => {
    expect(normalizeText('Validée')).toBe('validee');
    expect(normalizeText('  EN ATTENTE DE PAIEMENT ')).toBe('en attente de paiement');
  });

  it('renvoie une chaîne vide quand il ne reste rien', () => {
    expect(normalizeText('   ')).toBe('');
    expect(normalizeText('—')).toBe('');
  });
});

describe('formatCellValue', () => {
  it('affiche une Date du tableur en JJ/MM/AAAA', () => {
    // SheetJS renvoie un objet Date pour les cellules date des classeurs Excel, et
    // sa conversion implicite donnerait « Tue Oct 25 2022 00:00:00 GMT+0200 (…) ».
    expect(formatCellValue(new Date(2022, 9, 25))).toBe('25/10/2022');
    expect(formatCellValue(new Date(2024, 0, 5))).toBe('05/01/2024');
  });

  it('laisse les autres valeurs telles quelles, espaces retirés', () => {
    expect(formatCellValue('  Validée ')).toBe('Validée');
    expect(formatCellValue(45901)).toBe('45901');
  });

  it('renvoie une chaîne vide pour une valeur absente ou invalide', () => {
    expect(formatCellValue(null)).toBe('');
    expect(formatCellValue(undefined)).toBe('');
    expect(formatCellValue(new Date('nope'))).toBe('');
  });
});
