"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ALL_FOOD_PSC_CODES,
  FOOD_NAICS_CODES,
  FOOD_PSC_CODES,
  NAICS_LABELS,
  awardCount,
  searchAwards,
  searchRecipients,
  spendingByCategory,
  spendingOverTime,
  type SpendingFilters,
} from "@/lib/usaspending";

interface SpendingResult {
  amount: number;
  name: string;
  code?: string;
  count?: number;
  award_count?: number;
  transaction_count?: number;
}

const BREAKDOWN_LIMIT = 15;

interface TimeResult {
  time_period: { fiscal_year: string; quarter?: string };
  aggregated_amount: number;
}

interface Award {
  "Award ID": string;
  "Recipient Name": string;
  "Award Amount": number;
  "Total Outlays": number | null;
  Description: string;
  "Start Date": string;
  "End Date": string | null;
  "Contract Award Type": string;
  awarding_agency: string | null;
  awarding_sub_agency: string | null;
  "NAICS Code": string | null;
  "Place of Performance State Code": string | null;
  generated_internal_id: string | null;
  recipient_id: string | null;
  "Place of Performance City": string | null;
}

type Grouping = "fiscal_year" | "quarter";
type AwardSortKey =
  | "Award ID"
  | "Recipient Name"
  | "Award Amount"
  | "Description"
  | "awarding_agency"
  | "Start Date"
  | "Place of Performance State Code";

const AWARD_COLUMNS: Array<{ key: AwardSortKey; label: string; align?: "right" }> = [
  { key: "Award ID", label: "Award ID" },
  { key: "Recipient Name", label: "Recipient" },
  { key: "Award Amount", label: "Amount", align: "right" },
  { key: "Description", label: "Description" },
  { key: "awarding_agency", label: "Agency" },
  { key: "Start Date", label: "Date" },
  { key: "Place of Performance State Code", label: "State" },
];

function toggleFilterValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
}

function formatTooltipAmount(value: unknown): string {
  const amount = typeof value === "number" ? value : Number(value || 0);
  return `$${formatAmount(Number.isFinite(amount) ? amount : 0)}`;
}

function getCount(row: SpendingResult) {
  return row.count ?? row.award_count ?? row.transaction_count;
}

function getAwardTotal(response: { results?: Record<string, number> }) {
  const results = response.results || {};
  return Object.values(results).reduce((sum, value) => sum + (typeof value === "number" ? value : 0), 0);
}

function getPscLabel(code: string) {
  return FOOD_PSC_CODES[code] || code;
}

function getPscCode(row: SpendingResult) {
  if (row.code) return row.code;
  const match = Object.entries(FOOD_PSC_CODES).find(([, label]) => label === row.name);
  return match?.[0] || row.name;
}

function buildFilters({
  startDate,
  endDate,
  pscCodes,
  agencies,
  recipients,
}: {
  startDate: string;
  endDate: string;
  pscCodes: string[];
  agencies: string[];
  recipients: string[];
}): SpendingFilters {
  return {
    startDate,
    endDate,
    naicsCodes: FOOD_NAICS_CODES,
    pscCodes: pscCodes.length > 0 ? pscCodes : ALL_FOOD_PSC_CODES,
    agencyNames: agencies,
    recipientNames: recipients,
  };
}

function withPsc(filters: SpendingFilters, code: string): SpendingFilters {
  return { ...filters, pscCodes: [code] };
}

function withAgency(filters: SpendingFilters, name: string): SpendingFilters {
  return { ...filters, agencyNames: [name] };
}

function withRecipient(filters: SpendingFilters, name: string): SpendingFilters {
  return { ...filters, recipientNames: [name] };
}

async function addCounts(
  rows: SpendingResult[],
  getFilters: (row: SpendingResult) => SpendingFilters
) {
  const counts = await Promise.all(
    rows.map((row) =>
      awardCount(getFilters(row))
        .then((response) => getAwardTotal(response))
        .catch(() => null)
    )
  );

  return rows.map((row, index) => ({
    ...row,
    count: counts[index] ?? undefined,
  }));
}

export function FederalSpending() {
  const [startDate, setStartDate] = useState("2015-01-01");
  const [endDate, setEndDate] = useState("2026-12-31");
  const [pscFilter, setPscFilter] = useState<string[]>([]);
  const [agencyFilter, setAgencyFilter] = useState<string[]>([]);
  const [recipientFilter, setRecipientFilter] = useState<string[]>([]);
  const [grouping, setGrouping] = useState<Grouping>("fiscal_year");
  const [awardPage, setAwardPage] = useState(1);
  const [awardSort, setAwardSort] = useState<AwardSortKey>("Award Amount");
  const [awardOrder, setAwardOrder] = useState<"asc" | "desc">("desc");

  const filters = useMemo(
    () => buildFilters({
      startDate,
      endDate,
      pscCodes: pscFilter,
      agencies: agencyFilter,
      recipients: recipientFilter,
    }),
    [agencyFilter, endDate, pscFilter, recipientFilter, startDate]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAwardPage(1);
  }, [filters, awardSort, awardOrder]);

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-4"
        style={{ background: "var(--cream-50)", borderColor: "var(--cream-300)" }}
      >
        <div className="flex flex-wrap gap-4 items-end">
          <DateControl label="From" value={startDate} onChange={setStartDate} />
          <DateControl label="To" value={endDate} onChange={setEndDate} />
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--cream-400)" }}>
              Product Category (PSC)
            </label>
            <PscMultiSelectFilter
              selected={pscFilter}
              onToggle={(value) => setPscFilter((current) => toggleFilterValue(current, value))}
              onClear={() => setPscFilter([])}
            />
          </div>
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs mb-1" style={{ color: "var(--cream-400)" }}>
              Recipient
            </label>
            <RecipientSearch
              selected={recipientFilter}
              onAdd={(name) => {
                if (!recipientFilter.includes(name)) {
                  setRecipientFilter((c) => [...c, name]);
                }
              }}
            />
          </div>
        </div>
        {(agencyFilter.length > 0 || recipientFilter.length > 0 || pscFilter.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {pscFilter.map((code) => (
              <FilterChip key={code} label={`PSC ${code}`} onRemove={() => setPscFilter((current) => current.filter((v) => v !== code))} />
            ))}
            {agencyFilter.map((name) => (
              <FilterChip key={name} label={name} onRemove={() => setAgencyFilter((current) => current.filter((v) => v !== name))} />
            ))}
            {recipientFilter.map((name) => (
              <FilterChip key={name} label={name} onRemove={() => setRecipientFilter((current) => current.filter((v) => v !== name))} />
            ))}
            <button
              type="button"
              className="px-2 py-1 text-xs font-medium"
              style={{ color: "var(--hunter-600)" }}
              onClick={() => {
                setPscFilter([]);
                setAgencyFilter([]);
                setRecipientFilter([]);
              }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      <DashboardData
        filters={filters}
        grouping={grouping}
        setGrouping={setGrouping}
        selectedPsc={pscFilter}
        togglePsc={(code) => setPscFilter((current) => toggleFilterValue(current, code))}
        selectedAgencies={agencyFilter}
        toggleAgency={(name) => setAgencyFilter((current) => toggleFilterValue(current, name))}
        selectedRecipients={recipientFilter}
        toggleRecipient={(name) => setRecipientFilter((current) => toggleFilterValue(current, name))}
        awardPage={awardPage}
        setAwardPage={setAwardPage}
        awardSort={awardSort}
        setAwardSort={setAwardSort}
        awardOrder={awardOrder}
        setAwardOrder={setAwardOrder}
      />
    </div>
  );
}

function DashboardData({
  filters,
  grouping,
  setGrouping,
  selectedPsc,
  togglePsc,
  selectedAgencies,
  toggleAgency,
  selectedRecipients,
  toggleRecipient,
  awardPage,
  setAwardPage,
  awardSort,
  setAwardSort,
  awardOrder,
  setAwardOrder,
}: {
  filters: SpendingFilters;
  grouping: Grouping;
  setGrouping: (grouping: Grouping) => void;
  selectedPsc: string[];
  togglePsc: (code: string) => void;
  selectedAgencies: string[];
  toggleAgency: (name: string) => void;
  selectedRecipients: string[];
  toggleRecipient: (name: string) => void;
  awardPage: number;
  setAwardPage: (page: number) => void;
  awardSort: AwardSortKey;
  setAwardSort: (sort: AwardSortKey) => void;
  awardOrder: "asc" | "desc";
  setAwardOrder: (order: "asc" | "desc") => void;
}) {
  const [loading, setLoading] = useState(true);
  const [totalAmount, setTotalAmount] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [timeData, setTimeData] = useState<TimeResult[]>([]);
  const [agencies, setAgencies] = useState<SpendingResult[]>([]);
  const [products, setProducts] = useState<SpendingResult[]>([]);
  const [recipients, setRecipients] = useState<SpendingResult[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [selectedAward, setSelectedAward] = useState<Award | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    Promise.all([
      spendingByCategory("psc", filters, BREAKDOWN_LIMIT),
      spendingByCategory("awarding_agency", filters, BREAKDOWN_LIMIT),
      spendingByCategory("recipient", filters, BREAKDOWN_LIMIT),
      spendingOverTime(filters, grouping),
      searchAwards(filters, awardPage, 50, awardSort, awardOrder),
      awardCount(filters),
    ])
      .then(async ([pscData, agencyData, recipientData, timeResp, awardResp, countResp]) => {
        if (cancelled) return;
        const pscResults = pscData.results || [];
        const agencyResults = agencyData.results || [];
        const recipientResults = recipientData.results || [];
        const awardResults = awardResp.results || [];

        const [productsWithCounts, agenciesWithCounts, recipientsWithCounts] = await Promise.all([
          addCounts(pscResults, (row) => withPsc(filters, getPscCode(row))),
          addCounts(agencyResults, (row) => withAgency(filters, row.name)),
          addCounts(recipientResults, (row) => withRecipient(filters, row.name)),
        ]);

        if (cancelled) return;
        setProducts(productsWithCounts);
        setAgencies(agenciesWithCounts);
        setRecipients(recipientsWithCounts);
        setTimeData(timeResp.results || []);
        setAwards(awardResults);
        setTotalAmount(pscResults.reduce((sum: number, row: SpendingResult) => sum + (row.amount || 0), 0));
        setTotalCount(getAwardTotal(countResp));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setProducts([]);
        setAgencies([]);
        setRecipients([]);
        setTimeData([]);
        setAwards([]);
        setTotalAmount(0);
        setTotalCount(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [awardOrder, awardPage, awardSort, filters, grouping]);

  const chartData = timeData
    .filter((row) => row.aggregated_amount > 0)
    .map((row) => ({
      period: grouping === "fiscal_year"
        ? `FY${row.time_period.fiscal_year}`
        : `FY${row.time_period.fiscal_year} Q${row.time_period.quarter}`,
      amount: row.aggregated_amount,
    }));

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        <MetricCard label="Total Contract Amount" value={`$${formatAmount(totalAmount)}`} />
      </div>

      <div
        className="rounded-lg border p-6"
        style={{ background: "var(--cream-50)", borderColor: "var(--cream-300)" }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-semibold" style={{ color: "var(--hunter-700)" }}>
            Contract Amount Histogram
          </h3>
          <div className="flex rounded-md border overflow-hidden" style={{ borderColor: "var(--cream-300)" }}>
            {[
              ["fiscal_year", "Year"],
              ["quarter", "Quarter"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="px-3 py-1.5 text-sm font-medium"
                style={{
                  background: grouping === value ? "var(--hunter-600)" : "white",
                  color: grouping === value ? "white" : "var(--hunter-600)",
                }}
                onClick={() => setGrouping(value as Grouping)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8dece" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#2d4f2d" }} interval={grouping === "quarter" ? 3 : 0} />
            <YAxis tickFormatter={(value) => `$${formatAmount(value)}`} tick={{ fontSize: 11, fill: "#d4c4ad" }} width={72} />
            <Tooltip formatter={(value) => [formatTooltipAmount(value), "Amount"]} />
            <Bar dataKey="amount" fill="#4a7a4a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <BreakdownTable
          title="Top Awarding Agencies"
          rows={agencies}
          selected={selectedAgencies}
          onToggle={(row) => toggleAgency(row.name)}
        />
        <BreakdownTable
          title="Product Category"
          rows={products.map((row) => {
            const code = getPscCode(row);
            return { ...row, code, name: getPscLabel(code) };
          })}
          selected={selectedPsc}
          onToggle={(row) => togglePsc(row.code || row.name)}
          selectedKey={(row) => row.code || row.name}
        />
        <BreakdownTable
          title="Top Recipients"
          rows={recipients}
          selected={selectedRecipients}
          onToggle={(row) => toggleRecipient(row.name)}
        />
      </div>

      <AwardsTable
        awards={awards}
        page={awardPage}
        setPage={setAwardPage}
        sortKey={awardSort}
        setSortKey={setAwardSort}
        sortOrder={awardOrder}
        setSortOrder={setAwardOrder}
        onSelectAward={setSelectedAward}
      />

      {selectedAward && (
        <AwardDetail award={selectedAward} onClose={() => setSelectedAward(null)} />
      )}
    </div>
  );
}

function DateControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: "var(--cream-400)" }}>
        {label}
      </label>
      <input
        type="date"
        className="px-3 py-2 rounded-md text-sm"
        style={{ border: "1px solid var(--cream-300)", color: "var(--hunter-700)" }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg border p-5"
      style={{ background: "var(--hunter-700)", borderColor: "var(--hunter-800)" }}
    >
      <div className="text-3xl font-bold text-white">{value}</div>
      <div className="text-sm mt-1" style={{ color: "var(--hunter-200)" }}>
        {label}
      </div>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      className="rounded px-2 py-1 text-xs font-medium"
      style={{ background: "var(--hunter-100)", color: "var(--hunter-700)" }}
      onClick={onRemove}
    >
      {label} ×
    </button>
  );
}

function PscMultiSelectFilter({
  selected,
  onToggle,
  onClear,
}: {
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summary = selected.length === 0
    ? "All Subsistence"
    : selected.length === 1
      ? `${selected[0]}: ${FOOD_PSC_CODES[selected[0]] || selected[0]}`
      : `${selected.length} Product Categories`;

  useEffect(() => {
    function handleOutsideInteraction(event: MouseEvent | PointerEvent) {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    }

    document.addEventListener("pointerdown", handleOutsideInteraction);
    document.addEventListener("mousedown", handleOutsideInteraction);
    document.addEventListener("click", handleOutsideInteraction);
    return () => {
      document.removeEventListener("pointerdown", handleOutsideInteraction);
      document.removeEventListener("mousedown", handleOutsideInteraction);
      document.removeEventListener("click", handleOutsideInteraction);
    };
  }, []);

  return (
    <details ref={detailsRef} className="relative">
      <summary
        className="list-none cursor-pointer select-none rounded-md px-3 py-2 text-sm min-w-[240px]"
        style={{ border: "1px solid var(--cream-300)", background: "white", color: "var(--hunter-700)" }}
      >
        <span className="flex items-center justify-between gap-3">
          <span className="truncate">{summary}</span>
          <span aria-hidden="true" style={{ color: "var(--cream-400)" }}>▾</span>
        </span>
      </summary>
      <div className="absolute left-0 z-20 mt-2 w-72 rounded-md border p-2 shadow-lg" style={{ background: "white", borderColor: "var(--cream-300)" }}>
        <div className="flex items-center justify-between border-b pb-2 mb-2" style={{ borderColor: "var(--cream-200)" }}>
          <span className="text-xs font-medium uppercase" style={{ color: "var(--cream-400)" }}>Product Categories</span>
          {selected.length > 0 && <button type="button" className="text-xs font-medium" style={{ color: "var(--hunter-500)" }} onClick={onClear}>Clear</button>}
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {Object.entries(FOOD_PSC_CODES).map(([code, label]) => (
            <label key={code} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm" style={{ color: "var(--hunter-700)" }}>
              <input type="checkbox" className="accent-[#4a7a4a]" checked={selected.includes(code)} onChange={() => onToggle(code)} />
              <span className="truncate">{code}: {label}</span>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

function BreakdownTable({
  title,
  rows,
  selected,
  onToggle,
  selectedKey = (row) => row.name,
}: {
  title: string;
  rows: SpendingResult[];
  selected: string[];
  onToggle: (row: SpendingResult) => void;
  selectedKey?: (row: SpendingResult) => string;
}) {
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--cream-300)" }}>
      <div className="p-4 border-b" style={{ background: "var(--hunter-700)", borderColor: "var(--hunter-800)" }}>
        <h3 className="font-semibold text-white">{title}</h3>
      </div>
      <div className="max-h-[360px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b" style={{ background: "var(--hunter-50)", borderColor: "var(--cream-300)" }}>
            <tr>
              <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--hunter-600)" }}>Name</th>
              <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--hunter-600)" }}>Count</th>
              <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--hunter-600)" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.filter((row) => row.amount > 0).map((row, index) => {
              const key = selectedKey(row);
              const active = selected.includes(key);
              return (
                <tr
                  key={`${key}-${index}`}
                  className="cursor-pointer"
                  style={{
                    background: active ? "var(--hunter-100)" : index % 2 === 0 ? "var(--cream-50)" : "white",
                    borderBottom: "1px solid var(--cream-200)",
                  }}
                  onClick={() => onToggle(row)}
                >
                  <td className="px-3 py-2" style={{ color: "var(--hunter-700)" }}>{row.name}</td>
                  <td className="px-3 py-2 text-right" style={{ color: "var(--cream-400)" }}>{getCount(row)?.toLocaleString() || "—"}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--hunter-700)" }}>${formatAmount(row.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AwardsTable({
  awards,
  page,
  setPage,
  sortKey,
  setSortKey,
  sortOrder,
  setSortOrder,
  onSelectAward,
}: {
  awards: Award[];
  page: number;
  setPage: (page: number) => void;
  sortKey: AwardSortKey;
  setSortKey: (key: AwardSortKey) => void;
  sortOrder: "asc" | "desc";
  setSortOrder: (order: "asc" | "desc") => void;
  onSelectAward: (award: Award) => void;
}) {
  function toggleSort(key: AwardSortKey) {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder(key === "Award Amount" ? "desc" : "asc");
    }
  }

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--cream-300)" }}>
      <div className="p-4 border-b" style={{ background: "var(--hunter-700)", borderColor: "var(--hunter-800)" }}>
        <h3 className="font-semibold text-white">Individual Awards</h3>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="sticky top-0 z-10 border-b" style={{ background: "var(--hunter-50)", borderColor: "var(--cream-300)" }}>
            <tr>
              {AWARD_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 font-medium cursor-pointer select-none ${column.align === "right" ? "text-right" : "text-left"}`}
                  style={{ background: "var(--hunter-50)", color: "var(--hunter-600)" }}
                  onClick={() => toggleSort(column.key)}
                >
                  {column.label}
                  {sortKey === column.key ? (sortOrder === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {awards.map((award, index) => (
              <tr
                key={`${award["Award ID"]}-${index}`}
                className="cursor-pointer transition-colors"
                style={{ background: index % 2 === 0 ? "var(--cream-50)" : "white", borderBottom: "1px solid var(--cream-200)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hunter-50)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = index % 2 === 0 ? "var(--cream-50)" : "white")}
                onClick={() => onSelectAward(award)}
              >
                <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--hunter-500)" }}>{award["Award ID"]}</td>
                <td className="px-4 py-3" style={{ color: "var(--hunter-700)" }}>{award["Recipient Name"]}</td>
                <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--hunter-700)" }}>${formatAmount(award["Award Amount"] || 0)}</td>
                <td className="px-4 py-3 max-w-[320px] truncate" style={{ color: "var(--hunter-600)" }}>{award.Description}</td>
                <td className="px-4 py-3 max-w-[180px] truncate" style={{ color: "var(--cream-400)" }}>{award.awarding_agency}</td>
                <td className="px-4 py-3" style={{ color: "var(--hunter-600)" }}>{award["Start Date"]}</td>
                <td className="px-4 py-3" style={{ color: "var(--hunter-600)" }}>{award["Place of Performance State Code"]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t px-4 py-3" style={{ borderColor: "var(--cream-300)", background: "var(--cream-50)" }}>
        <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm rounded disabled:opacity-30" style={{ border: "1px solid var(--cream-300)", color: "var(--hunter-600)" }}>Previous</button>
        <span className="text-sm" style={{ color: "var(--cream-400)" }}>Page {page}</span>
        <button type="button" onClick={() => setPage(page + 1)} disabled={awards.length < 50} className="px-3 py-1.5 text-sm rounded disabled:opacity-30" style={{ border: "1px solid var(--cream-300)", color: "var(--hunter-600)" }}>Next</button>
      </div>
    </div>
  );
}

function RecipientSearch({
  selected,
  onAdd,
}: {
  selected: string[];
  onAdd: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchRecipients(query.trim(), 10).then((data) => {
        setResults(
          (data.results || [])
            .map((r) => r.recipient_name)
            .filter((name) => !selected.includes(name))
        );
        setOpen(true);
      });
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, selected]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        placeholder="Search recipients..."
        className="w-full px-3 py-2 rounded-md text-sm"
        style={{ border: "1px solid var(--cream-300)", color: "var(--hunter-700)" }}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && results.length > 0 && (
        <div
          className="absolute left-0 right-0 z-20 mt-1 rounded-md border shadow-lg max-h-64 overflow-y-auto"
          style={{ background: "white", borderColor: "var(--cream-300)" }}
        >
          {results.map((name) => (
            <button
              key={name}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--hunter-50)]"
              style={{ color: "var(--hunter-700)" }}
              onClick={() => {
                onAdd(name);
                setQuery("");
                setResults([]);
                setOpen(false);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AwardDetail({ award, onClose }: { award: Award; onClose: () => void }) {
  const usaSpendingUrl = award.generated_internal_id
    ? `https://www.usaspending.gov/award/${award.generated_internal_id}`
    : null;

  const naicsLabel = award["NAICS Code"] ? NAICS_LABELS[award["NAICS Code"]] || "" : "";
  const pscLabel = award["Award ID"]
    ? Object.entries(FOOD_PSC_CODES).find(([, label]) =>
        (award.Description || "").toLowerCase().includes(label.toLowerCase())
      )?.[1] || ""
    : "";

  const location = [award["Place of Performance City"], award["Place of Performance State Code"]]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        className="rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--cream-50)" }}
      >
        <div
          className="flex items-center justify-between p-6 border-b"
          style={{
            background: "var(--hunter-700)",
            borderColor: "var(--hunter-800)",
            borderRadius: "12px 12px 0 0",
          }}
        >
          <h2 className="text-lg font-bold text-white pr-4">{award["Award ID"]}</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-2xl leading-none flex-shrink-0"
          >
            &times;
          </button>
        </div>
        <div className="p-6 space-y-4">
          {usaSpendingUrl && (
            <a
              href={usaSpendingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center px-4 py-3 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ background: "var(--hunter-600)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hunter-700)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--hunter-600)")}
            >
              View Full Award Details on USAspending.gov →
            </a>
          )}

          <div
            className="rounded-lg border p-4"
            style={{ background: "var(--cream-100)", borderColor: "var(--cream-300)" }}
          >
            <div className="text-3xl font-bold" style={{ color: "var(--hunter-700)" }}>
              ${(award["Award Amount"] || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <div className="text-sm mt-1" style={{ color: "var(--cream-400)" }}>Award Amount</div>
            {award["Total Outlays"] != null && (
              <div className="text-sm mt-2" style={{ color: "var(--hunter-600)" }}>
                Total Outlays: ${award["Total Outlays"].toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <AwardField label="Recipient" value={award["Recipient Name"]} />
            <AwardField label="Agency" value={award.awarding_agency} />
            <AwardField label="Sub-Agency" value={award.awarding_sub_agency} />
            <AwardField label="Award Type" value={award["Contract Award Type"]} />
            <AwardField
              label="NAICS Code"
              value={award["NAICS Code"] ? `${award["NAICS Code"]}${naicsLabel ? ` - ${naicsLabel}` : ""}` : null}
            />
            <AwardField label="Place of Performance" value={location || null} />
            <AwardField label="Start Date" value={award["Start Date"]} />
            <AwardField label="End Date" value={award["End Date"]} />
          </div>

          {award.Description && (
            <div>
              <div
                className="text-xs font-medium uppercase tracking-wide mb-1"
                style={{ color: "var(--cream-400)" }}
              >
                Description
              </div>
              <div className="text-sm" style={{ color: "var(--hunter-700)" }}>
                {award.Description}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AwardField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: "var(--cream-400)" }}
      >
        {label}
      </div>
      <div className="text-sm mt-0.5" style={{ color: "var(--hunter-700)" }}>
        {value || "—"}
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="animate-spin h-8 w-8 border-4 border-t-transparent rounded-full" style={{ borderColor: "var(--hunter-400)", borderTopColor: "transparent" }} />
    </div>
  );
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return amount.toFixed(0);
}
