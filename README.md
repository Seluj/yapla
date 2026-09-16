# Automation Yapla Web

Exportateur CSV pour les membres Yapla du **BDS (Bureau des Sports)** de l'ESTA.

On dépose un export Excel (`.xlsx` / `.xls`) ou CSV issu de Yapla, on associe les colonnes,
on vérifie l'aperçu, et on obtient un CSV propre destiné au bot Discord
[`Discord-Bot-BDS-v2`](../Discord-Bot-BDS-v2).

Le fichier peut être **téléchargé**, ou **envoyé directement au bot** sans passer par
la commande `/upload`. Le traitement reste intégralement dans le navigateur : rien
n'est transmis tant que l'envoi vers le bot n'est pas demandé explicitement.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Développement](#développement)
- [Qualité](#qualité)
- [Build](#build)
- [Docker](#docker)
- [Déploiement](#déploiement)
- [Utilisation](#utilisation)
- [Format de sortie](#format-de-sortie)
- [Architecture](#architecture)
- [Suivi de l'audit de septembre 2026](#suivi-de-laudit-de-septembre-2026)

---

## Fonctionnalités

- Zone de dépôt glisser-déposer
- Prise en charge des fichiers CSV en plus d'Excel
- Détection automatique des en-têtes français courants (Prénom, Nom, Début, Fin/Expiration,
  Statut d'adhésion)
- Filtre facultatif sur le **statut d'adhésion** : seules les adhésions validées sont exportées
- Persistance du mapping (`localStorage`) par jeu d'en-têtes
- Aperçu des premières lignes, **avec les dates telles qu'elles seront interprétées**
- Filtrage des adhésions non actives à la date du jour et déduplication par nom/prénom
- Compte rendu d'export détaillé : lignes écartées, adhésions expirées, doublons fusionnés
- Signalement des noms trop longs pour Discord (> 32 caractères)

---

## Développement

```bash
npm install
npm start
```

Puis ouvrir http://localhost:4200

> `npm install` télécharge `xlsx` depuis le CDN SheetJS et non depuis npm — voir
> [Le cas `xlsx`](#le-cas-xlsx). Une connexion à `cdn.sheetjs.com` est donc nécessaire.

---

## Qualité

```bash
npm test          # Vitest — 87 tests
npm run lint      # ESLint (angular-eslint)
npm run format    # Prettier (écriture) ; `format:check` en lecture seule
```

Ces quatre commandes, plus `npm run build` et `npm audit`, sont rejouées par la CI
GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) sur chaque
push et chaque pull request vers `main`.

Les tests couvrent la logique métier — analyse des dates, détection des colonnes,
échappement CSV, déduplication — ainsi que le rendu du composant.

---

## Build

```bash
npm run build
```

Sortie dans `dist/automation-yapla-web/browser` (~133 kB initial, `xlsx` en chunk
différé chargé seulement au dépôt d'un fichier).

---

## Docker

L'image se construit depuis la racine de l'espace de travail, où vit le compose
unique des deux services :

```bash
docker compose -f compose.yaml -f compose.build.yaml build web
```

Puis, la pile démarrée, ouvrir **http://localhost:8100**

Notes :

- Build Docker multi-étages (builder Node → runtime nginx unprivileged, non-root)
- Nginx sert la sortie `dist/*/browser` et écoute sur le port **8100**
- Cache long terme sur les assets hachés, `no-cache` sur `index.html`
- En-têtes de sécurité définis dans [`security-headers.conf`](security-headers.conf),
  inclus dans chaque bloc `location` : `Content-Security-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Cross-Origin-Opener-Policy`, `Permissions-Policy`
- `location = /api/adherents` relaie vers le conteneur du bot sur le réseau interne

Seul ce dernier point demande que le bot tourne à côté : lancée seule, l'image sert
l'application normalement et l'envoi vers le bot échoue avec un message explicite.

### Pourquoi un relais plutôt qu'un appel direct

Le navigateur ne parle qu'à l'origine qui lui a servi la page. Cela évite d'exposer
l'API du bot sur Internet, dispense de toute configuration CORS, et permet surtout de
garder `connect-src 'self'` dans la politique de sécurité de contenu : aucun script de
cette page ne peut envoyer quoi que ce soit ailleurs.

---

## Déploiement

Uniquement par conteneur, avec le bot, depuis le dépôt de déploiement à la racine
de l'espace de travail :

```bash
docker compose pull && docker compose up -d
```

L'image est publiée sur `registry.selutech.fr/bds/yapla`. Voir
[`../README.md`](../README.md) pour les variables d'environnement et la publication
de nouvelles versions.

> L'ancien déploiement GitHub Pages a été retiré : l'envoi direct vers le bot suppose
> un relais côté serveur, qu'un hébergement statique ne peut pas fournir.

---

## Utilisation

1. Déposer un fichier `.xlsx`, `.xls` ou `.csv`.
2. Vérifier les associations de colonnes (Prénom, Nom, Début, Fin, et éventuellement
   Statut d'adhésion). Elles sont proposées automatiquement et mémorisées pour ce jeu
   d'en-têtes.
3. **Contrôler l'aperçu.** Il affiche côte à côte la valeur du fichier et la date
   interprétée ; les lignes qui seront écartées apparaissent en rouge.
4. Cliquer sur « Exporter CSV », puis lire le compte rendu affiché sous le bouton :
   il indique combien de lignes ont été lues, exportées, écartées et pourquoi.

### Filtre sur le statut d'adhésion

Un export Yapla contient toutes les adhésions, quel que soit leur état : `Validée`,
`Expirée`, `Annulée`, `En attente de paiement`, `En attente de validation`.

Le champ **Statut d'adhésion** est facultatif :

- **Renseigné** — seules les adhésions `Validée` sont exportées. La comparaison ignore
  la casse et les accents.
- **Laissé vide** — toutes les adhésions sont retenues, et un avertissement est affiché
  dans l'écran d'association ainsi que dans le compte rendu d'export.

La détection automatique retient `Adhésion - Statut d'adhésion` et écarte volontairement
`Membre - Statut`, qui vaut `Actif` / `Inactif` / `Archivé` et n'a rien à voir : la
retenir écarterait la totalité des lignes, aucune n'étant « Validée ».

Le statut sert uniquement de filtre — **il n'apparaît jamais dans le CSV produit**, qui
conserve ses quatre colonnes.

> Les exports Yapla contiennent des données personnelles (noms, courriels, téléphones,
> adresses, dates de naissance). `.gitignore` écarte les `*.xlsx`, `*.xls` et `*.csv` à
> la racine du dépôt pour éviter de les committer par mégarde.

---

## Format de sortie

Fichier `adherent.csv`, encodé en UTF-8 **avec BOM**, séparateur `;`, sans en-tête de
colonnes. Première ligne technique :

```
Base de données;Base de données;2026-09-16;2026-09-16
DUPONT;Marie;2025-09-01;2026-08-31
"DU;RAND";Léa;2025-10-01;2026-08-31
```

Colonnes : `nom;prénom;début;fin`, dates au format `YYYY-MM-DD`.
Les champs contenant `;`, `"` ou un saut de ligne sont encadrés de guillemets selon
RFC 4180, ce que `csv-parse` — utilisé par le bot — relit nativement.

Seuls les adhérents **actifs à la date du jour** sont exportés (bornes incluses),
dédupliqués sur (nom, prénom) en conservant l'adhésion la plus ancienne. Lorsque la
colonne de statut est associée, les adhésions non validées sont écartées au préalable.

---

## Architecture

La logique métier est séparée du composant, en modules purs et testables :

| Fichier                      | Rôle                                                           |
| ---------------------------- | -------------------------------------------------------------- |
| `src/app/text.ts`            | Normalisation et affichage des libellés et valeurs de cellule  |
| `src/app/date-utils.ts`      | Analyse et formatage des dates de calendrier (UTC)             |
| `src/app/mapping.ts`         | Détection automatique des colonnes, filtre de statut compris   |
| `src/app/mapping-storage.ts` | Persistance du mapping dans `localStorage`                     |
| `src/app/csv.ts`             | Échappement RFC 4180 et assemblage du document                 |
| `src/app/adherent.ts`        | Modèle `Adherent`, filtres, déduplication, génération du CSV   |
| `src/app/bot-api.ts`         | Dépôt du CSV dans le bot et persistance du jeton d'API         |
| `src/app/app.ts`             | Composant : lecture du fichier, état (signals), aperçu, export |

Le composant est en `signal()` et l'application tourne en mode **zoneless**
(`provideZonelessChangeDetection`) : `zone.js` n'est plus embarqué.

---

# Suivi de l'audit de septembre 2026

> Audit réalisé le 16/09/2026 sur le commit `ebbc51d`.
> Correctifs appliqués le 16/09/2026, vérifiés par `npm run lint`, `npm test`,
> `npm run build` et un test manuel de l'image Docker de production.

## 1. Dépendances — réglé

| Bloc                     | Avant  | Après                    |
| ------------------------ | ------ | ------------------------ |
| `@angular/*`             | 20.2.4 | **22.1.6**               |
| `@angular/build` / `cli` | 20.2.2 | **22.1.8**               |
| `typescript`             | 5.9.2  | **6.0.3**                |
| `angular-cli-ghpages`    | 2.0.3  | **retiré depuis**        |
| `xlsx`                   | 0.18.5 | **0.20.3** (CDN SheetJS) |

Les deux majeures Angular ont été passées séparément (20 → 21, puis 21 → 22).

TypeScript reste en **6.0.3** et non en 7.0.2 : Angular 22 déclare le pair
`typescript: ">=6.0 <6.1"`. La 7.0.2 citée dans l'audit est la dernière publiée sur
npm, pas une version installable ici. Même remarque pour Vitest, plafonné à `^4` par
`@angular/build`.

### Vulnérabilités — de 50 à 0

`npm audit` ne remonte plus **aucune** vulnérabilité (contre 50, dont 3 critiques et
34 hautes).

L'essentiel venait de **Karma**, déprécié en Angular 22, qui tirait à lui seul une
dizaine d'advisories via `socket.io` / `ws` / `body-parser`. Le projet a donc été
migré vers le nouveau builder `@angular/build:unit-test` avec **Vitest**, au moyen de
la migration officielle `ng update @angular/cli --name migrate-karma-to-vitest`.
`karma`, `jasmine-core` et `@types/jasmine` ont été désinstallés — ce qui règle aussi
les trois lignes correspondantes du tableau d'obsolescence de l'audit.

Le reste a été fermé par la montée Angular, `angular-cli-ghpages@3` et un
`npm audit fix`. Ce dernier paquet a depuis été désinstallé avec l'abandon du
déploiement GitHub Pages.

### Le cas `xlsx`

`xlsx` est désormais installé depuis le CDN SheetJS, qui porte les correctifs absents
de npm :

```bash
npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

Le `package.json` référence cette URL et `npm ci` la résout comme n'importe quelle
dépendance — y compris en CI et dans le build Docker.

## 2. Anomalies — réglées

### 🔴 L'auto-détection mappait « Nom » sur la colonne Prénom — réglé

`src/app/mapping.ts`

La comparaison se fait maintenant sur l'en-tête **normalisé** (minuscules, accents
retirés, ponctuation ramenée à des espaces) et **mot à mot** : `prenom` n'est plus un
mot de « Nom », et `nom` n'est plus une sous-chaîne de « Prénom ». Une liste
d'exclusions écarte en plus « Surnom », « Nom d'utilisateur » ou « Nombre de… ».

L'attribution est gloutonne sur un score décroissant et une colonne déjà retenue ne
peut plus être proposée à un second champ.

### 🔴 Les dates françaises étaient mal interprétées — réglé

`src/app/date-utils.ts`

`parseDate` analyse explicitement `JJ/MM/AAAA` (ainsi que les séparateurs `-` et `.`,
les années sur deux chiffres, l'ISO `AAAA-MM-JJ` et les numéros de série Excel), et
rejette les dates qui n'existent pas au lieu de les reporter silencieusement
(`31/02/2025` ne devient plus le 3 mars).

**Une seconde cause, en amont, a été trouvée pendant la vérification** : sur un
fichier CSV, SheetJS convertissait lui-même les cellules ressemblant à des dates avec
la convention américaine, _avant_ que la valeur n'atteigne notre analyseur.
« 01/09/2025 » arrivait déjà transformé en numéro de série valant le 9 janvier, alors
que « 15/03/2026 » restait du texte — une corruption à la fois silencieuse et
incohérente d'une ligne à l'autre. La lecture se fait donc désormais avec
`{ raw: true, cellDates: true }` : le texte reste du texte, et les vraies cellules
date des classeurs Excel sont décodées par SheetJS en objets `Date`.

Enfin, plus aucune ligne n'est écartée en silence : `extractAdherents` renvoie la
liste des lignes rejetées avec leur numéro et leur motif, affichée après l'export.

### 🟠 Aucun échappement CSV — réglé

`src/app/csv.ts`

Échappement RFC 4180 (guillemets doublés, champ encadré s'il contient `;`, `"` ou un
saut de ligne) et BOM UTF-8 en tête de fichier.

Vérifié dans les deux sens : le CSV produit a été relu avec `csv-parse` dans la
configuration exacte du bot (`delimiter: ';'`, `columns: false`, `ltrim: true`). Les
champs échappés sont restitués à l'identique, et le BOM ne gêne pas `getDbDate`, qui
teste `row[1]` et non `row[0]`.

### 🟠 La suite de tests était rouge — réglé

Le test d'échafaudage a été remplacé. La suite compte **62 tests** répartis sur six
fichiers, dont la couverture porte en priorité sur les fonctions qui portaient les
bugs : `parseDate`, `suggestMapping`, `escapeCsvField`, `extractAdherents`.

Contrôle de sensibilité : en réintroduisant les trois bugs d'origine, 11 tests
passent au rouge.

### 🟡 `localStorage` non protégé — réglé

`src/app/mapping-storage.ts`

Lecture et écriture encapsulées dans `try/catch`. Un stockage indisponible (Safari en
navigation privée, quota atteint) fait simplement perdre le mapping mémorisé au lieu
de casser le chargement du fichier. Une colonne enregistrée qui n'existe plus dans le
fichier déposé est ignorée.

### 🟡 Conversion des dates série Excel sensible au fuseau — réglé

Toutes les dates sont représentées par un instant **UTC à minuit** et formatées avec
les accesseurs UTC : il n'y a plus de dépendance au fuseau de la machine, ni de
glissement d'un jour aux transitions heure d'été / heure d'hiver.

## 3. Qualité et infrastructure — réglées

### 3.1 Code

- Composant réécrit en `signal()` / `computed()`, en `OnPush` (le défaut en Angular 22)
  et en mode **zoneless** ; `zone.js` a été retiré des dépendances et des polyfills.
- `rows: any[]` et `workbook: any` remplacés par des types explicites.
- `RouterOutlet`, `app.routes.ts` et `provideRouter` supprimés — le routeur n'était
  pas utilisé. `FormsModule` a également disparu au profit de liaisons natives.
- `formatDate` n'est plus dupliqué : il vit dans `date-utils.ts`.
- Le commentaire évoquant le SSR a été supprimé.
- ESLint (`angular-eslint`) et Prettier sont installés et câblés, `eslint-config-prettier`
  désamorçant les conflits entre les deux.

### 3.2 Documentation

Les deux affirmations fausses relevées par l'audit sont corrigées : le port documenté
est bien **8100**, et les en-têtes de sécurité existent réellement.

Une troisième a été trouvée au passage : la liste des fonctionnalités promettait un
« aperçu des premières lignes » qui n'était pas implémenté, et l'étape 3 du mode
d'emploi demandait de le contrôler. L'aperçu a été **ajouté** plutôt que retiré de la
documentation : il affiche la valeur brute et la date interprétée côte à côte, ce qui
est précisément le garde-fou qui manquait contre les erreurs de lecture de dates.

### 3.3 Infrastructure

- `EXPOSE` corrigé de 8081 à **8100**.
- **Node relevé de 24.7.0 à 24.21.0 dans le `Dockerfile`** : le build de production
  échouait, Angular 22 exigeant `^22.22.3 || ^24.15.0 || >=26.0.0`.
- En-têtes de sécurité rétablis dans `nginx.conf`, factorisés dans
  `security-headers.conf` et inclus dans chaque bloc `location` — `add_header` ne
  s'héritant pas dans un `location` qui définit ses propres en-têtes. `server_tokens`
  est désactivé.
- `expires 1y` remplacé par un `Cache-Control` explicite sur les assets : les deux
  directives émettaient chacune leur en-tête et la réponse en portait deux.
- `compose.yaml` réduit à l'essentiel : les commentaires du template Docker et le
  `NODE_ENV: production` inutile ont été supprimés, un `healthcheck` ajouté.
- CI GitHub Actions minimale : `lint`, `format:check`, `test`, `build`, `audit`.

## 4. Anomalie découverte pendant la vérification

Le test de l'image Docker a mis au jour un défaut de rendu introduit par la
réécriture : les quatre listes déroulantes affichaient toutes « Prénom ». La liaison
`[value]` sur le `<select>` était appliquée avant que le `@for` n'ait créé les
`<option>`, et le navigateur retombait alors sur la première. La sélection est
désormais portée par `[selected]` sur chaque option, et un test de composant couvre
ce cas.

C'est aussi ce test manuel qui a révélé la réinterprétation des dates par SheetJS
décrite plus haut : aucun test unitaire ne l'aurait vue, puisque le bug se produisait
dans la bibliothèque, en amont du code testé.

## 5. Reste à faire

- Le `package-lock.json` était modifié dans le working tree avant ces correctifs
  (suppressions cosmétiques de `"peer": true`). Il a de toute façon été régénéré par
  la montée de version.
- Aucun test n'existe sur le rendu complet d'un vrai fichier `.xlsx` binaire : la
  couverture s'arrête au CSV et aux données déjà désérialisées.
