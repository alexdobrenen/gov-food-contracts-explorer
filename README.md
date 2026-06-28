# Federal Food Services Contract Explorer

Interactive explorer for DLA Troop Support food services contracts and federal food spending data.

The project has two parts:

- `src/dla_contracts/`: Python scraper and SQLite data pipeline for DLA contract search data.
- `web/`: static Next.js app for browsing DLA contracts and USAspending.gov food contract spending.

## Run The Website Locally

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000.

## Build For GitHub Pages

```bash
cd web
NEXT_PUBLIC_BASE_PATH=/federal-food-services-contract-explorer npm run build
```

The build exports rows from `data/contracts.db` into `web/src/data/contracts.json`, then writes the static site to `web/out/`.

## Deployment

GitHub Pages deployment is configured in `.github/workflows/deploy-pages.yml`. In GitHub repository settings, set Pages to deploy from **GitHub Actions**, then push to `main`.

The DLA contract table is bundled into the static site. The Federal Spending tab calls the public USAspending.gov API from the browser.
