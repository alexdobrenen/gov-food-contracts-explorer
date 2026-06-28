import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "src", "data");
const outPath = path.join(outDir, "opportunities.json");

const API_KEY = process.env.SAM_GOV_API_KEY;
const BASE_URL = "https://api.sam.gov/prod/opportunity/v2/search";

const FOOD_NAICS_CODES = [
  "311411", "311412", "311421", "311422", "311423",
  "311511", "311611", "311612", "311613", "311615",
  "311710", "311811", "311812", "311813",
  "311919", "311920", "311941", "311942",
  "311991", "311999",
  "312111",
  "722310",
];

const FOOD_PSC_CODES = [
  "8905", "8910", "8915", "8920", "8925", "8930",
  "8935", "8940", "8945", "8950", "8955", "8960",
  "8965", "8970",
];

const NOTICE_TYPES = "p,o,k,r";

if (!API_KEY) {
  if (fs.existsSync(outPath)) {
    console.log("SAM_GOV_API_KEY not set; keeping existing opportunities.json");
    process.exit(0);
  }
  console.error("SAM_GOV_API_KEY is required (set in environment or .env)");
  process.exit(1);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function fetchPage(params) {
  const url = new URL(BASE_URL);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("noticeType", NOTICE_TYPES);
  url.searchParams.set("postedFrom", daysAgo(90));
  url.searchParams.set("limit", "999");
  url.searchParams.set("offset", "0");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: API_KEY },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SAM.gov API error ${res.status}: ${text}`);
  }
  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOpportunity(raw) {
  const poc = raw.pointOfContact?.[0] || {};
  const pop = raw.placeOfPerformance || {};
  const addr = pop.streetAddress2 || pop.city?.name || null;
  return {
    noticeId: raw.noticeId,
    title: raw.title || "",
    solicitationNumber: raw.solicitationNumber || "",
    noticeType: raw.type || raw.noticeType || "",
    naicsCode: raw.naicsCode || "",
    pscCode: raw.classificationCode || "",
    responseDeadline: raw.responseDeadLine || raw.responseDeadline || null,
    postedDate: raw.postedDate || "",
    setAsideType: raw.typeOfSetAsideDescription || raw.typeOfSetAside || null,
    placeOfPerformance: {
      city: pop.city?.name || null,
      state: pop.state?.code || pop.state?.name || null,
      country: pop.country?.code || pop.country?.name || null,
    },
    contractingOffice: raw.officeAddress?.name || raw.office || null,
    department: raw.department || raw.departmentName || null,
    pointOfContact: {
      name: poc.fullName || null,
      email: poc.email || null,
      phone: poc.phone || null,
    },
    description: (raw.description || "").slice(0, 500),
    samUrl: `https://sam.gov/opp/${raw.noticeId}/view`,
    archiveDate: raw.archiveDate || null,
  };
}

async function main() {
  const seen = new Map();

  const queries = [
    ...FOOD_NAICS_CODES.map((code) => ({ param: "ncode", code })),
    ...FOOD_PSC_CODES.map((code) => ({ param: "psc", code })),
  ];

  for (const { param, code } of queries) {
    try {
      const data = await fetchPage({ [param]: code });
      const items = data.opportunitiesData || data.opportunities || [];
      for (const item of items) {
        if (item.noticeId && !seen.has(item.noticeId)) {
          seen.set(item.noticeId, normalizeOpportunity(item));
        }
      }
      console.log(`  ${param}=${code}: ${items.length} results`);
    } catch (err) {
      console.warn(`  ${param}=${code}: ${err.message}`);
    }
    await sleep(250);
  }

  const opportunities = Array.from(seen.values()).sort(
    (a, b) => (a.responseDeadline || "9999").localeCompare(b.responseDeadline || "9999")
  );

  if (opportunities.length === 0 && fs.existsSync(outPath)) {
    console.log("\nNo results fetched (possible rate limit). Keeping existing data.");
    return;
  }

  const output = {
    meta: {
      fetchedAt: new Date().toISOString(),
      totalCount: opportunities.length,
    },
    opportunities,
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nExported ${opportunities.length} opportunities to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
