import { afterEach, describe, expect, it, vi } from 'vitest';

import { ColumnMapping } from './mapping';
import { loadMapping, mappingStorageKey, saveMapping } from './mapping-storage';

const HEADERS = ['Prénom', 'Nom', 'Début', 'Fin'];

const MAPPING: ColumnMapping = {
  firstNameCol: 'Prénom',
  lastNameCol: 'Nom',
  adhesionStartCol: 'Début',
  adhesionEndCol: 'Fin',
  statusCol: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('mappingStorageKey', () => {
  it('ne dépend pas de l’ordre des colonnes', () => {
    expect(mappingStorageKey(['b', 'a'])).toBe(mappingStorageKey(['a', 'b']));
  });
});

describe('loadMapping / saveMapping', () => {
  it('relit un mapping enregistré', () => {
    saveMapping(HEADERS, MAPPING);

    expect(loadMapping(HEADERS)).toEqual(MAPPING);
  });

  it('renvoie null quand rien n’est enregistré', () => {
    expect(loadMapping(HEADERS)).toBeNull();
  });

  it('renvoie null sur un contenu corrompu', () => {
    localStorage.setItem(mappingStorageKey(HEADERS), 'pas du json');

    expect(loadMapping(HEADERS)).toBeNull();
  });

  it('omet une colonne enregistrée qui n’existe plus dans le fichier', () => {
    // Omise et non `null` : l'appelant laissera alors la détection automatique
    // proposer une colonne à la place.
    saveMapping(HEADERS, { ...MAPPING, lastNameCol: 'Colonne disparue' });

    const loaded = loadMapping(HEADERS)!;
    expect('lastNameCol' in loaded).toBe(false);
    expect(loaded.firstNameCol).toBe('Prénom');
  });

  it('conserve un champ que l’utilisateur a explicitement vidé', () => {
    saveMapping(HEADERS, { ...MAPPING, statusCol: null });

    const loaded = loadMapping(HEADERS)!;
    expect('statusCol' in loaded).toBe(true);
    expect(loaded.statusCol).toBeNull();
  });

  it('omet un champ absent d’un mapping enregistré avant son ajout', () => {
    // Les mappings enregistrés avant l'arrivée de la colonne de statut ne portent
    // pas la clé : la détection automatique doit reprendre la main.
    localStorage.setItem(
      mappingStorageKey(HEADERS),
      JSON.stringify({
        firstNameCol: 'Prénom',
        lastNameCol: 'Nom',
        adhesionStartCol: 'Début',
        adhesionEndCol: 'Fin',
      }),
    );

    expect('statusCol' in loadMapping(HEADERS)!).toBe(false);
  });

  it('survit à un localStorage indisponible', () => {
    // Safari en navigation privée lève sur getItem/setItem : cela cassait le
    // chargement du fichier au lieu de simplement perdre le mapping.
    const boom = () => {
      throw new DOMException('QuotaExceededError');
    };
    vi.spyOn(localStorage, 'getItem').mockImplementation(boom);
    vi.spyOn(localStorage, 'setItem').mockImplementation(boom);

    expect(() => saveMapping(HEADERS, MAPPING)).not.toThrow();
    expect(loadMapping(HEADERS)).toBeNull();
  });
});
