import { describe, expect, it } from 'vitest';

import { isMappingComplete, suggestMapping } from './mapping';

describe('suggestMapping', () => {
  it('distingue Nom de Prénom sur des en-têtes Yapla typiques', () => {
    // Régression : `lower.includes('nom')` est vrai pour « prénom », les deux champs
    // pointaient donc sur la colonne Prénom et le CSV contenait le prénom en double.
    const mapping = suggestMapping(['Prénom', 'Nom', 'Début adhésion', 'Fin adhésion']);

    expect(mapping).toEqual({
      firstNameCol: 'Prénom',
      lastNameCol: 'Nom',
      adhesionStartCol: 'Début adhésion',
      adhesionEndCol: 'Fin adhésion',
      statusCol: null,
    });
  });

  it('reste correct quel que soit l’ordre des colonnes', () => {
    const mapping = suggestMapping(['Nom', 'Prénom', 'Fin adhésion', 'Début adhésion']);

    expect(mapping.firstNameCol).toBe('Prénom');
    expect(mapping.lastNameCol).toBe('Nom');
    expect(mapping.adhesionStartCol).toBe('Début adhésion');
    expect(mapping.adhesionEndCol).toBe('Fin adhésion');
  });

  it('n’attribue jamais la même colonne à deux champs', () => {
    const mapping = suggestMapping(['Nom', 'Date']);
    const assigned = Object.values(mapping).filter((value): value is string => value !== null);

    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('ignore les colonnes qui contiennent « nom » sans être un nom de famille', () => {
    const mapping = suggestMapping(['Nombre de séances', "Nom d'utilisateur", 'Surnom']);

    expect(mapping.lastNameCol).toBeNull();
  });

  it('reconnaît les variantes usuelles', () => {
    const mapping = suggestMapping(['Nom de famille', 'First Name', 'Date de début', 'Expiration']);

    expect(mapping.firstNameCol).toBe('First Name');
    expect(mapping.lastNameCol).toBe('Nom de famille');
    expect(mapping.adhesionStartCol).toBe('Date de début');
    expect(mapping.adhesionEndCol).toBe('Expiration');
  });

  it('ne propose pas la colonne Fin comme date de début', () => {
    const mapping = suggestMapping(['Nom', 'Prénom', 'Fin adhésion']);

    expect(mapping.adhesionStartCol).toBeNull();
    expect(mapping.adhesionEndCol).toBe('Fin adhésion');
  });

  it("détecte la colonne « Statut d'adhésion » d'un export Yapla", () => {
    const mapping = suggestMapping([
      'Membre - Nom',
      'Membre - Prénom',
      "Adhésion - Début de l'adhésion",
      "Adhésion - Expiration de l'adhésion",
      "Adhésion - Statut d'adhésion",
    ]);

    expect(mapping.statusCol).toBe("Adhésion - Statut d'adhésion");
  });

  it('ne confond pas « Membre - Statut » avec le statut d’adhésion', () => {
    // « Membre - Statut » vaut Actif / Inactif / Archivé : le retenir écarterait
    // toutes les lignes, aucune n'étant « Validée ».
    expect(suggestMapping(['Membre - Statut', 'Nom', 'Prénom']).statusCol).toBeNull();
  });

  it("préfère le statut d'adhésion quand les deux colonnes coexistent", () => {
    const mapping = suggestMapping([
      'Membre - Statut',
      "Adhésion - Statut d'adhésion",
      'Membre - Nom',
    ]);

    expect(mapping.statusCol).toBe("Adhésion - Statut d'adhésion");
  });

  it('laisse le statut vide quand aucune colonne ne correspond', () => {
    expect(suggestMapping(['Prénom', 'Nom', 'Début', 'Fin']).statusCol).toBeNull();
  });

  it('laisse les champs vides quand rien ne correspond', () => {
    expect(suggestMapping(['Colonne A', 'Colonne B'])).toEqual({
      firstNameCol: null,
      lastNameCol: null,
      adhesionStartCol: null,
      adhesionEndCol: null,
      statusCol: null,
    });
  });
});

describe('isMappingComplete', () => {
  it('exige les quatre colonnes obligatoires', () => {
    const full = suggestMapping(['Prénom', 'Nom', 'Début adhésion', 'Fin adhésion']);

    expect(isMappingComplete(full)).toBe(true);
    expect(isMappingComplete({ ...full, lastNameCol: null })).toBe(false);
  });

  it("n'exige pas la colonne de statut, qui est facultative", () => {
    const full = suggestMapping(['Prénom', 'Nom', 'Début adhésion', 'Fin adhésion']);

    expect(full.statusCol).toBeNull();
    expect(isMappingComplete(full)).toBe(true);
  });
});
