import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "src", "data");
const outPath = path.join(outDir, "opportunities.json");

const BASE_URL = "https://api.sam.gov/opportunities/v2/search";
const NOTICE_TYPES = "p,o,k,r";
const MAX_REQUESTS = 9;
const DEFAULT_LOOKBACK_DAYS = 14;
const PAGE_LIMIT = 1000;
const FOOD_CLASSIFICATION_CODE = "89";

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDateInput(value) {
  if (!value) return null;
  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (mmddyyyy) {
    const [, month, day, year] = mmddyyyy;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const yyyymmdd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (yyyymmdd) {
    const [, year, month, day] = yyyymmdd;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatSamDate(value) {
  const date = value instanceof Date ? value : parseDateInput(value);
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid SAM.gov date: ${value}`);
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

export function getDateRange(env = process.env, now = new Date()) {
  const postedTo = env.SAM_POSTED_TO
    ? parseDateInput(env.SAM_POSTED_TO)
    : now;
  const postedFrom = env.SAM_POSTED_FROM
    ? parseDateInput(env.SAM_POSTED_FROM)
    : addDays(postedTo, -DEFAULT_LOOKBACK_DAYS);

  return {
    postedFrom: formatSamDate(postedFrom),
    postedTo: formatSamDate(postedTo),
  };
}

function readExistingData(filePath = outPath) {
  if (!fs.existsSync(filePath)) return { meta: null, opportunities: [] };
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      meta: data.meta || null,
      opportunities: Array.isArray(data.opportunities) ? data.opportunities : [],
    };
  } catch (err) {
    console.warn(`Could not read existing opportunities data: ${err.message}`);
    return { meta: null, opportunities: [] };
  }
}

function extractOrgName(raw) {
  if (raw.department || raw.departmentName) return raw.department || raw.departmentName;
  if (raw.fullParentPathName) return String(raw.fullParentPathName).split(".")[0] || null;
  return null;
}

function getContact(raw) {
  const contact = raw.pointOfContact?.[0] || raw.pointofContact?.[0] || {};
  return {
    name: contact.fullName || contact.fullname || null,
    email: contact.email || null,
    phone: contact.phone || null,
  };
}

function getState(pop) {
  return pop?.state?.code || pop?.state?.name || pop?.city?.state?.code || pop?.city?.state?.name || null;
}

function normalizeDateString(value) {
  if (!value) return null;
  return String(value).split(" ")[0] || null;
}

function sanitizeSamString(value) {
  return value.replace(/([?&]api_key=)[^&\s]+/gi, "$1[redacted]");
}

export function sanitizeSamData(value) {
  if (Array.isArray(value)) return value.map(sanitizeSamData);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key.toLowerCase() !== "api_key")
        .map(([key, item]) => [key, sanitizeSamData(item)])
    );
  }
  return typeof value === "string" ? sanitizeSamString(value) : value;
}

export function normalizeOpportunity(raw) {
  const pop = raw.placeOfPerformance || {};
  const office = raw.officeAddress || {};
  const noticeId = raw.noticeId || raw.noticeid || "";

  return {
    noticeId,
    title: raw.title || "",
    solicitationNumber: raw.solicitationNumber || "",
    noticeType: raw.type || raw.noticeType || "",
    naicsCode: raw.naicsCode || "",
    pscCode: raw.classificationCode || "",
    responseDeadline: normalizeDateString(raw.responseDeadLine || raw.responseDeadline || raw.reponseDeadLine),
    postedDate: normalizeDateString(raw.postedDate),
    setAsideType: raw.typeOfSetAsideDescription || raw.typeOfSetAside || raw.setAside || null,
    placeOfPerformance: {
      city: pop.city?.name || null,
      state: getState(pop),
      country: pop.country?.code || pop.country?.name || null,
    },
    contractingOffice: office.name || raw.office || null,
    department: extractOrgName(raw),
    pointOfContact: getContact(raw),
    description: String(raw.description || "").slice(0, 500),
    samUrl: raw.uiLink && raw.uiLink !== "null" ? raw.uiLink : `https://sam.gov/opp/${noticeId}/view`,
    archiveDate: normalizeDateString(raw.archiveDate),
    active: raw.active || null,
    sourceData: sanitizeSamData(raw),
  };
}

export function isFutureRelevant(opportunity) {
  if (opportunity.active && String(opportunity.active).toLowerCase() === "no") return false;
  return true;
}

export function mergeOpportunities(existing, fetched, now = new Date()) {
  const byId = new Map();
  for (const item of existing) {
    if (item.noticeId && isFutureRelevant(item, now)) byId.set(item.noticeId, item);
  }
  for (const item of fetched) {
    if (item.noticeId && isFutureRelevant(item, now)) byId.set(item.noticeId, item);
  }

  return Array.from(byId.values()).sort((a, b) => {
    const aDate = a.responseDeadline || "9999-12-31";
    const bDate = b.responseDeadline || "9999-12-31";
    return aDate.localeCompare(bDate);
  });
}

export function buildSearchUrl({
  apiKey,
  offset,
  dateRange,
  limit = PAGE_LIMIT,
  classificationCode = FOOD_CLASSIFICATION_CODE,
}) {
  const url = new URL(BASE_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("ptype", NOTICE_TYPES);
  url.searchParams.set("status", "active");
  url.searchParams.set("postedFrom", dateRange.postedFrom);
  url.searchParams.set("postedTo", dateRange.postedTo);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("ccode", classificationCode);
  return url;
}

async function fetchPage({ apiKey, offset, dateRange, classificationCode, fetchImpl = fetch }) {
  const url = buildSearchUrl({ apiKey, offset, dateRange, classificationCode });
  const res = await fetchImpl(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SAM.gov API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function fetchOpportunities({
  apiKey,
  maxRequests = MAX_REQUESTS,
  dateRange,
  classificationCode = FOOD_CLASSIFICATION_CODE,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) throw new Error("SAM_GOV_API_KEY is required");

  const requestBudget = Math.min(parsePositiveInt(maxRequests, MAX_REQUESTS), MAX_REQUESTS);
  const opportunities = [];
  let requestCount = 0;
  let totalRecords = null;

  for (let offset = 0; requestCount < requestBudget; offset += 1) {
    const data = await fetchPage({ apiKey, offset, dateRange, classificationCode, fetchImpl });
    requestCount += 1;

    totalRecords = Number(data.totalRecords || 0);
    const items = data.opportunitiesData || data.opportunities || [];
    opportunities.push(...items.map(normalizeOpportunity));

    const fetchedCount = offset * PAGE_LIMIT + items.length;
    const hasMore = totalRecords > fetchedCount && items.length > 0;
    if (!hasMore) {
      return { opportunities, requestCount, totalRecords, truncated: false };
    }
  }

  return {
    opportunities,
    requestCount,
    totalRecords,
    truncated: totalRecords == null || opportunities.length < totalRecords,
  };
}

export async function run({ env = process.env, outputPath = outPath, fetchImpl = fetch, now = new Date() } = {}) {
  const apiKey = env.SAM_GOV_API_KEY;
  const existing = readExistingData(outputPath);

  if (!apiKey) {
    if (fs.existsSync(outputPath)) {
      console.log("SAM_GOV_API_KEY not set; keeping existing opportunities.json");
      return { wrote: false, reason: "missing-api-key" };
    }
    throw new Error("SAM_GOV_API_KEY is required (set in environment or GitHub Actions secret)");
  }

  const maxRequests = Math.min(parsePositiveInt(env.SAM_MAX_REQUESTS, MAX_REQUESTS), MAX_REQUESTS);
  const classificationCode = env.SAM_CLASSIFICATION_CODE || FOOD_CLASSIFICATION_CODE;
  const dateRange = getDateRange(env, now);
  let fetched;

  try {
    fetched = await fetchOpportunities({
      apiKey,
      maxRequests,
      dateRange,
      classificationCode,
      fetchImpl,
    });
  } catch (err) {
    if (existing.opportunities.length > 0) {
      console.warn(`SAM.gov fetch failed; keeping existing opportunities.json. ${err.message}`);
      return { wrote: false, reason: "api-error", error: err };
    }
    throw err;
  }

  if (fetched.opportunities.length === 0 && existing.opportunities.length > 0) {
    console.log("\nNo results fetched. Keeping existing opportunities.json.");
    return { wrote: false, reason: "empty-fetch", fetched };
  }

  const opportunities = mergeOpportunities(existing.opportunities, fetched.opportunities, now);
  const output = {
    meta: {
      fetchedAt: now.toISOString(),
      totalCount: opportunities.length,
      source: "sam.gov",
      query: {
        ccode: classificationCode,
        ptype: NOTICE_TYPES,
        status: "active",
        postedFrom: dateRange.postedFrom,
        postedTo: dateRange.postedTo,
      },
      requestCount: fetched.requestCount,
      requestBudget: maxRequests,
      apiTotalRecords: fetched.totalRecords,
      truncated: fetched.truncated,
      warning: fetched.truncated
        ? `SAM.gov returned more than ${maxRequests} pages; results were truncated to stay within the request budget.`
        : null,
    },
    opportunities,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nExported ${opportunities.length} opportunities to ${outputPath}`);
  console.log(`SAM.gov requests used: ${fetched.requestCount}/${maxRequests}`);
  if (fetched.truncated) console.warn(output.meta.warning);

  return { wrote: true, output };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
