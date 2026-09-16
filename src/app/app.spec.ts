import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { App } from './app';
import { SheetRow } from './adherent';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let app: App;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    fixture = TestBed.createComponent(App);
    app = fixture.componentInstance;
  });

  it('crée le composant', () => {
    expect(app).toBeTruthy();
  });

  it('affiche le titre de l’application', async () => {
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h1')?.textContent).toContain(
      'Exportateur CSV pour Membres Yapla',
    );
  });

  it('n’autorise l’export qu’une fois les quatre colonnes associées', async () => {
    expect(app.canExport()).toBe(false);

    app.rows.set([{ Nom: 'DUPONT' }]);
    app.headers.set(['Nom', 'Prénom', 'Début', 'Fin']);
    expect(app.canExport()).toBe(false);

    app.mapping.set({
      firstNameCol: 'Prénom',
      lastNameCol: 'Nom',
      adhesionStartCol: 'Début',
      adhesionEndCol: 'Fin',
      statusCol: null,
    });
    expect(app.canExport()).toBe(true);
  });

  it('affiche dans l’aperçu les dates telles qu’elles seront interprétées', () => {
    const rows: SheetRow[] = [
      { Nom: 'DUPONT', Prénom: 'Marie', Début: '15/09/2025', Fin: '31/08/2026' },
      { Nom: 'MARTIN', Prénom: 'Luc', Début: 'bientôt', Fin: '31/08/2026' },
    ];
    app.rows.set(rows);
    app.headers.set(['Nom', 'Prénom', 'Début', 'Fin']);
    app.mapping.set({
      firstNameCol: 'Prénom',
      lastNameCol: 'Nom',
      adhesionStartCol: 'Début',
      adhesionEndCol: 'Fin',
      statusCol: null,
    });

    const preview = app.preview();

    expect(preview[0]).toMatchObject({ debutParsed: '2025-09-15', valid: true });
    expect(preview[1]).toMatchObject({ debutParsed: '', valid: false });
  });

  it('laisse l’aperçu vide tant que le mapping est incomplet', () => {
    app.rows.set([{ Nom: 'DUPONT' }]);

    expect(app.preview()).toEqual([]);
  });

  it('lit un CSV de bout en bout sans laisser SheetJS réinterpréter les dates', async () => {
    // Régression : sans `raw`, SheetJS convertissait lui-même « 01/09/2025 » en
    // numéro de série avec la convention américaine (9 janvier), avant même que
    // notre analyseur ne voie la valeur. « 15/03/2026 », lui, restait du texte.
    const csv = [
      'Prénom,Nom,Début adhésion,Fin adhésion',
      'Marie,DUPONT,01/09/2025,31/08/2026',
      'Luc,MARTIN,15/03/2026,31/08/2026',
    ].join('\n');

    await app.handleFile(new File([csv], 'export.csv', { type: 'text/csv' }));

    expect(app.parseError()).toBeNull();
    expect(app.headers()).toEqual(['Prénom', 'Nom', 'Début adhésion', 'Fin adhésion']);
    expect(app.mapping()).toEqual({
      firstNameCol: 'Prénom',
      lastNameCol: 'Nom',
      adhesionStartCol: 'Début adhésion',
      adhesionEndCol: 'Fin adhésion',
      statusCol: null,
    });
    expect(app.preview().map((row) => row.debutParsed)).toEqual(['2025-09-01', '2026-03-15']);
  });

  it('signale un fichier illisible sans casser l’état du composant', async () => {
    await app.handleFile(new File([new Uint8Array([0, 1, 2, 3])], 'cassé.xlsx'));

    expect(app.parseError()).not.toBeNull();
    expect(app.rows()).toEqual([]);
    expect(app.canExport()).toBe(false);
  });

  it('reflète le mapping suggéré dans les listes déroulantes', async () => {
    // Régression : avec `[value]` sur le `select`, la valeur était appliquée avant
    // que les `option` n'existent et les quatre listes retombaient sur « Prénom ».
    app.rows.set([{ Prénom: 'Marie', Nom: 'DUPONT', Début: '01/09/2025', Fin: '31/08/2026' }]);
    app.headers.set(['Prénom', 'Nom', 'Début', 'Fin']);
    app.mapping.set({
      firstNameCol: 'Prénom',
      lastNameCol: 'Nom',
      adhesionStartCol: 'Début',
      adhesionEndCol: 'Fin',
      statusCol: null,
    });
    await fixture.whenStable();

    const selected = (id: string) =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(`#${id}`)?.value;

    expect(selected('firstNameCol')).toBe('Prénom');
    expect(selected('lastNameCol')).toBe('Nom');
    expect(selected('adhesionStartCol')).toBe('Début');
    expect(selected('adhesionEndCol')).toBe('Fin');
  });

  it('avertit tant qu’aucune colonne de statut n’est associée', async () => {
    const csv = [
      'Prénom,Nom,Début adhésion,Fin adhésion',
      'Marie,DUPONT,01/09/2025,31/08/2026',
    ].join('\n');

    await app.handleFile(new File([csv], 'sans-statut.csv', { type: 'text/csv' }));
    await fixture.whenStable();

    expect(app.mapping().statusCol).toBeNull();
    expect(app.statusFilterDisabled()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.warning-message')).not.toBeNull();
    // Le filtre est facultatif : son absence ne doit pas bloquer l'export.
    expect(app.canExport()).toBe(true);
  });

  it('associe la colonne de statut et n’avertit plus', async () => {
    const csv = [
      "Prénom,Nom,Début adhésion,Fin adhésion,Adhésion - Statut d'adhésion",
      'Marie,DUPONT,01/09/2025,31/08/2026,Validée',
      'Luc,MARTIN,01/09/2025,31/08/2026,Annulée',
    ].join('\n');

    await app.handleFile(new File([csv], 'avec-statut.csv', { type: 'text/csv' }));
    await fixture.whenStable();

    expect(app.mapping().statusCol).toBe("Adhésion - Statut d'adhésion");
    expect(app.statusFilterDisabled()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.warning-message')).toBeNull();
    // L'aperçu montre le statut et marque la ligne qui sera écartée.
    expect(app.preview().map((row) => [row.statut, row.valid])).toEqual([
      ['Validée', true],
      ['Annulée', false],
    ]);
  });

  it('peut remettre le filtre de statut à vide', async () => {
    const csv = [
      "Prénom,Nom,Début adhésion,Fin adhésion,Statut d'adhésion",
      'Marie,DUPONT,01/09/2025,31/08/2026,Validée',
    ].join('\n');
    await app.handleFile(new File([csv], 'avec-statut.csv', { type: 'text/csv' }));
    expect(app.mapping().statusCol).not.toBeNull();

    app.onColumnChange('statusCol', { target: { value: '' } } as unknown as Event);

    expect(app.mapping().statusCol).toBeNull();
    expect(app.canExport()).toBe(true);
  });

  it('complète un mapping enregistré avant l’ajout de la colonne de statut', async () => {
    const headers = ['Prénom', 'Nom', 'Début adhésion', 'Fin adhésion', "Statut d'adhésion"];
    localStorage.setItem(
      'mapping:' + [...headers].sort().join('|'),
      JSON.stringify({
        firstNameCol: 'Prénom',
        lastNameCol: 'Nom',
        adhesionStartCol: 'Début adhésion',
        adhesionEndCol: 'Fin adhésion',
      }),
    );
    const csv = [headers.join(','), 'Marie,DUPONT,01/09/2025,31/08/2026,Validée'].join('\n');

    await app.handleFile(new File([csv], 'export.csv', { type: 'text/csv' }));

    expect(app.mapping().statusCol).toBe("Statut d'adhésion");
  });

  it('respecte un filtre de statut que l’utilisateur a vidé', async () => {
    const headers = ['Prénom', 'Nom', 'Début adhésion', 'Fin adhésion', "Statut d'adhésion"];
    localStorage.setItem(
      'mapping:' + [...headers].sort().join('|'),
      JSON.stringify({
        firstNameCol: 'Prénom',
        lastNameCol: 'Nom',
        adhesionStartCol: 'Début adhésion',
        adhesionEndCol: 'Fin adhésion',
        statusCol: null,
      }),
    );
    const csv = [headers.join(','), 'Marie,DUPONT,01/09/2025,31/08/2026,Validée'].join('\n');

    await app.handleFile(new File([csv], 'export.csv', { type: 'text/csv' }));

    expect(app.mapping().statusCol).toBeNull();
  });

  it('enregistre le mapping choisi pour le jeu d’en-têtes courant', () => {
    app.headers.set(['Nom', 'Prénom', 'Début', 'Fin']);

    app.onColumnChange('lastNameCol', {
      target: { value: 'Nom' },
    } as unknown as Event);

    expect(app.mapping().lastNameCol).toBe('Nom');
    expect(localStorage.length).toBe(1);
  });
});
