import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildSearchUrl,
  fetchOpportunities,
  formatSamDate,
  getDateRange,
  mergeOpportunities,
  run,
} from "../fetch-sam-opportunities.mjs";

test("formats SAM.gov dates as MM/dd/yyyy", () => {
  assert.equal(formatSamDate("2026-06-28"), "06/28/2026");
  assert.deepEqual(
    getDateRange({}, new Date(2026, 5, 28)),
    { postedFrom: "06/14/2026", postedTo: "06/28/2026" }
  );
});

test("builds documented broad food search params", () => {
  const url = buildSearchUrl({
    apiKey: "test-key",
    offset: 2,
    dateRange: { postedFrom: "06/14/2026", postedTo: "06/28/2026" },
  });

  assert.equal(url.hostname, "api.sam.gov");
  assert.equal(url.pathname, "/opportunities/v2/search");
  assert.equal(url.searchParams.get("api_key"), "test-key");
  assert.equal(url.searchParams.get("ptype"), "p,o,k,r");
  assert.equal(url.searchParams.get("status"), "active");
  assert.equal(url.searchParams.get("postedFrom"), "06/14/2026");
  assert.equal(url.searchParams.get("postedTo"), "06/28/2026");
  assert.equal(url.searchParams.get("limit"), "1000");
  assert.equal(url.searchParams.get("offset"), "2");
  assert.equal(url.searchParams.get("ccode"), "89");
  assert.equal(url.searchParams.has("psc"), false);
  assert.equal(url.searchParams.has("noticeType"), false);
});

test("never exceeds max request budget and marks truncation", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(new URL(url));
    return {
      ok: true,
      async json() {
        return {
          totalRecords: 5000,
          opportunitiesData: [{ noticeId: `notice-${urls.length}`, title: "Food", active: "Yes" }],
        };
      },
    };
  };

  const result = await fetchOpportunities({
    apiKey: "test-key",
    maxRequests: 2,
    dateRange: { postedFrom: "06/14/2026", postedTo: "06/28/2026" },
    fetchImpl,
  });

  assert.equal(urls.length, 2);
  assert.deepEqual(urls.map((url) => url.searchParams.get("offset")), ["0", "1"]);
  assert.equal(result.requestCount, 2);
  assert.equal(result.truncated, true);
});

test("merges fetched notices into existing data by noticeId", () => {
  const existing = [
    { noticeId: "keep", title: "Old", active: "Yes", responseDeadline: "2026-07-01" },
    { noticeId: "replace", title: "Old", active: "Yes", responseDeadline: "2026-07-02" },
  ];
  const fetched = [
    { noticeId: "replace", title: "New", active: "Yes", responseDeadline: "2026-07-03" },
    { noticeId: "add", title: "Added", active: "Yes", responseDeadline: "2026-07-04" },
  ];

  const merged = mergeOpportunities(existing, fetched, new Date(2026, 5, 28));
  assert.equal(merged.length, 3);
  assert.equal(merged.find((item) => item.noticeId === "replace").title, "New");
});

test("preserves existing JSON when every API call fails before results", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sam-fetch-"));
  const outputPath = path.join(dir, "opportunities.json");
  const original = {
    meta: { fetchedAt: "2026-01-01T00:00:00.000Z", totalCount: 1 },
    opportunities: [{ noticeId: "existing", title: "Existing", active: "Yes" }],
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(original, null, 2)}\n`);

  const result = await run({
    env: { SAM_GOV_API_KEY: "test-key", SAM_MAX_REQUESTS: "1" },
    outputPath,
    now: new Date(2026, 5, 28),
    fetchImpl: async () => ({ ok: false, status: 429, async text() { return "rate limited"; } }),
  });

  assert.equal(result.wrote, false);
  assert.equal(result.reason, "api-error");
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), original);
});

test("missing API key keeps existing output", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sam-fetch-"));
  const outputPath = path.join(dir, "opportunities.json");
  fs.writeFileSync(outputPath, JSON.stringify({ meta: {}, opportunities: [] }));

  const result = await run({ env: {}, outputPath, now: new Date(2026, 5, 28) });
  assert.equal(result.wrote, false);
  assert.equal(result.reason, "missing-api-key");
});
