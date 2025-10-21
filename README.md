# Automation Yapla Web

CSV exporter for Yapla members. Upload your Excel (.xlsx/.xls) or CSV, map the columns, preview the first rows, and export a clean CSV.

## What's new
- Drag-and-drop upload zone
- CSV file support in addition to Excel
- Auto-detection of common French headers (Prénom, Nom, Début, Fin/Expiration)
- Mapping persistence (localStorage) per header set
- Preview of first 5 mapped rows and total row count
- Reset mapping and Clear data buttons
- Hardened Docker/Nginx with static asset caching and security headers

Chrome is the only supported browser target.

## Development

Start a dev server:

```bash
npm install
npm start
```

Open http://localhost:4200

## Build

```bash
npm run build
```

Outputs to `dist/`.

## Docker (production-like)

Build and run with Compose:

```bash
docker compose up --build
```

Then open http://localhost:8081

Notes:
- Uses a multi-stage Docker build (Node builder -> nginx unprivileged runtime)
- Nginx serves `/dist/*/browser` output
- Security headers and long-term caching for static assets are enabled

## Usage
1. Upload or drop an `.xlsx`, `.xls`, or `.csv` file.
2. Verify or adjust the detected column mappings (Prénom, Nom, Début, Fin).
3. Review the preview table.
4. Click “Exporter CSV” to download the processed file.

## Project Info
- Angular CLI: 20.2.x
- Node: as defined in Docker ARG (24-alpine at build time). Local dev can use a compatible Node 20/22/24.
