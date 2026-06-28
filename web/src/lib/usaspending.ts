const BASE_URL = "https://api.usaspending.gov/api/v2";

export const FOOD_NAICS_CODES = [
  "311411", "311412", "311421", "311422", "311423",
  "311511", "311611", "311612", "311613", "311615",
  "311710", "311811", "311812", "311813",
  "311919", "311920", "311941", "311942",
  "311991", "311999",
  "312111",
  "722310",
];

export const NAICS_LABELS: Record<string, string> = {
  "311411": "Frozen Fruit/Vegetable Mfg",
  "311412": "Frozen Specialty Food Mfg",
  "311421": "Fruit & Vegetable Canning",
  "311422": "Specialty Canning",
  "311423": "Dried/Dehydrated Food Mfg",
  "311511": "Fluid Milk Mfg",
  "311611": "Animal Slaughtering",
  "311612": "Meat Processing",
  "311613": "Rendering & Meat Byproduct",
  "311615": "Poultry Processing",
  "311710": "Seafood Preparation & Packaging",
  "311811": "Retail Bakeries",
  "311812": "Commercial Bakeries",
  "311813": "Frozen Pastries Mfg",
  "311919": "Other Snack Food Mfg",
  "311920": "Coffee & Tea Mfg",
  "311941": "Sauces & Dressing Mfg",
  "311942": "Spice & Extract Mfg",
  "311991": "Perishable Prepared Food Mfg",
  "311999": "Other Misc Food Mfg",
  "312111": "Soft Drink Mfg",
  "722310": "Food Service Contractors",
};

export const FOOD_PSC_CODES: Record<string, string> = {
  "8905": "Meat, Poultry & Fish",
  "8910": "Dairy Foods & Eggs",
  "8915": "Fruits & Vegetables",
  "8920": "Bakery & Cereal Products",
  "8925": "Sugar, Confectionery & Nuts",
  "8930": "Jams, Jellies & Preserves",
  "8935": "Soups & Bouillons",
  "8940": "Special Dietary Foods",
  "8945": "Food Oils & Fats",
  "8950": "Condiments",
  "8955": "Coffee, Tea & Cocoa",
  "8960": "Beverages, Nonalcoholic",
  "8965": "Beverages, Alcoholic",
  "8970": "Composite Food Packages",
};

export const ALL_FOOD_PSC_CODES = Object.keys(FOOD_PSC_CODES);

export interface SpendingFilters {
  naicsCodes?: string[];
  pscCodes?: string[];
  agencyName?: string;
  agencyNames?: string[];
  recipientNames?: string[];
  startDate?: string;
  endDate?: string;
  keywords?: string[];
}

function buildFilters(filters: SpendingFilters) {
  const f: Record<string, unknown> = {
    time_period: [
      {
        start_date: filters.startDate || "2020-01-01",
        end_date: filters.endDate || "2026-12-31",
      },
    ],
    award_type_codes: ["A", "B", "C", "D"],
  };

  if (filters.pscCodes && filters.pscCodes.length > 0) {
    f.psc_codes = filters.pscCodes;
  } else {
    f.naics_codes = filters.naicsCodes || FOOD_NAICS_CODES;
  }

  if (filters.keywords) f.keywords = filters.keywords;
  const agencies = filters.agencyNames?.length
    ? filters.agencyNames
    : filters.agencyName
      ? [filters.agencyName]
      : [];
  if (agencies.length > 0) {
    f.agencies = agencies.map((name) => ({ type: "awarding", tier: "toptier", name }));
  }
  if (filters.recipientNames && filters.recipientNames.length > 0) {
    f.recipient_search_text = filters.recipientNames;
  }

  return f;
}

export async function searchAwards(
  filters: SpendingFilters,
  page = 1,
  limit = 25,
  sort = "Award Amount",
  order: "asc" | "desc" = "desc"
) {
  const payload = {
    filters: buildFilters(filters),
    fields: [
      "Award ID",
      "Recipient Name",
      "Award Amount",
      "Total Outlays",
      "Description",
      "Start Date",
      "End Date",
      "Contract Award Type",
      "awarding_agency",
      "awarding_sub_agency",
      "NAICS Code",
      "Place of Performance State Code",
      "generated_internal_id",
      "recipient_id",
      "Place of Performance City",
    ],
    page,
    limit,
    sort,
    order,
  };

  const res = await fetch(`${BASE_URL}/search/spending_by_award/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return res.json();
}

export async function awardSearchCount(filters: SpendingFilters) {
  const payload = {
    filters: buildFilters(filters),
    fields: ["Award ID"],
    page: 1,
    limit: 1,
    sort: "Award Amount",
    order: "desc",
  };

  const res = await fetch(`${BASE_URL}/search/spending_by_award/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  return Number(data.page_metadata?.total || 0);
}

export async function spendingByCategory(
  category: "recipient" | "awarding_agency" | "awarding_subagency" | "naics" | "psc",
  filters: SpendingFilters,
  limit = 20
) {
  const f = buildFilters(filters);
  f.award_type_codes = ["A", "B", "C", "D"];

  const payload = {
    filters: f,
    category,
    page: 1,
    limit,
  };

  const res = await fetch(`${BASE_URL}/search/spending_by_category/${category}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return res.json();
}

export async function searchRecipients(query: string, limit = 10) {
  const res = await fetch(`${BASE_URL}/autocomplete/recipient/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ search_text: query, limit }),
  });
  return res.json() as Promise<{ results: { recipient_name: string }[] }>;
}

export async function spendingOverTime(
  filters: SpendingFilters,
  group: "fiscal_year" | "quarter" | "month" = "fiscal_year"
) {
  const f = buildFilters(filters);
  if (!filters.startDate) {
    f.time_period = [{ start_date: "2015-01-01", end_date: filters.endDate || "2026-12-31" }];
  }

  const payload = { filters: f, group };

  const res = await fetch(`${BASE_URL}/search/spending_over_time/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return res.json();
}
