# Federal Food Services Contract Explorer

Static Next.js explorer for DLA Troop Support food services contracts and federal food spending data.

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Static Build

```bash
npm run build
```

The build exports contract rows from `../data/contracts.db` into `src/data/contracts.json`, then writes the static site to `out/`.

For a GitHub Pages project site named `federal-food-services-contract-explorer`, build with:

```bash
NEXT_PUBLIC_BASE_PATH=/federal-food-services-contract-explorer npm run build
```

## GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml`. After the repository is renamed to `federal-food-services-contract-explorer`, enable GitHub Pages with **Build and deployment: GitHub Actions**. Push to `main` or run the workflow manually.

The DLA contract table is bundled statically. The Federal Spending tab calls the public USAspending.gov API directly from the browser.
