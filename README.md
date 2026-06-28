# Gov Food Contracts Explorer

Browse open federal food contract opportunities and historical spending data.

**Live site:** [alexdobrenen.github.io/gov-food-contracts-explorer](https://alexdobrenen.github.io/gov-food-contracts-explorer)

## Features

- **Open Opportunities** — Active solicitations from SAM.gov with filters, deadline tracking, and direct links to solicitation documents
- **Federal Food Spending** — Historical contract awards from USAspending.gov with recipient search, agency breakdowns, and spending trends

## Run Locally

```bash
cd web
npm install
npm run dev
```

## Deployment

Pushes to `main` trigger GitHub Pages deployment via Actions. The SAM.gov data refreshes daily via a scheduled workflow (requires `SAM_GOV_API_KEY` secret).
