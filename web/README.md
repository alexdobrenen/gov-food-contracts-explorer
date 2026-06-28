# Gov Food Contracts Explorer

Static Next.js explorer for open federal food contract opportunities and federal food spending data.

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

For the GitHub Pages project site named `gov-food-contracts-explorer`, build with:

```bash
NEXT_PUBLIC_BASE_PATH=/gov-food-contracts-explorer npm run build
```

## GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml`. Enable GitHub Pages with **Build and deployment: GitHub Actions**. Push to `main` or run the workflow manually.

The DLA contract table is bundled statically. The Federal Spending tab calls the public USAspending.gov API directly from the browser.
