"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  ALL_FOOD_PSC_CODES,
  FOOD_NAICS_CODES,
  FOOD_PSC_CODES,
  searchAwards,
  spendingByCategory,
  spendingOverTime,
  type SpendingFilters,
} from "@/lib/usaspending";

interface SpendingResult {
  amount: number;
  name: string;
  code?: string;
}

interface TimeResult {
  time_period: { fiscal_year: string; quarter?: string; month?: string };
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
}

type View = "overview" | "trends" | "awards" | "recipients" | "agencies";

function formatTooltipAmount(value: unknown): string {
  const amount = typeof value === "number" ? value : Number(value || 0);
  return `$${formatAmount(Number.isFinite(amount) ? amount : 0)}`;
}

function getSpendingFilters({
  startDate,
  endDate,
  keywords,
  psc,
}: {
  startDate: string;
  endDate: string;
  keywords: string;
  psc: string;
}): SpendingFilters {
  return {
    startDate,
    endDate,
    keywords: keywords ? [keywords] : undefined,
    naicsCodes: FOOD_NAICS_CODES,
    pscCodes: psc === "all" ? ALL_FOOD_PSC_CODES : psc ? psc.split(",") : undefined,
  };
}

export function FederalSpending() {
  const [view, setView] = useState<View>("overview");
  const [startDate, setStartDate] = useState("2015-01-01");
  const [endDate, setEndDate] = useState("2026-12-31");
  const [keywords, setKeywords] = useState("");
  const [pscFilter, setPscFilter] = useState<string>("");

  const pscParam = pscFilter || "all";

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div
        className="rounded-lg border p-4"
        style={{ background: "var(--cream-50)", borderColor: "var(--cream-300)" }}
      >
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--cream-400)" }}>
              From
            </label>
            <input
              type="date"
              className="px-3 py-2 rounded-md text-sm"
              style={{ border: "1px solid var(--cream-300)", color: "var(--hunter-700)" }}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--cream-400)" }}>
              To
            </label>
            <input
              type="date"
              className="px-3 py-2 rounded-md text-sm"
              style={{ border: "1px solid var(--cream-300)", color: "var(--hunter-700)" }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--cream-400)" }}>
              Product Category (PSC)
            </label>
            <select
              className="px-3 py-2 rounded-md text-sm"
              style={{ border: "1px solid var(--cream-300)", color: "var(--hunter-700)" }}
              value={pscFilter}
              onChange={(e) => setPscFilter(e.target.value)}
            >
              <option value="">All Subsistence</option>
              {Object.entries(FOOD_PSC_CODES).map(([code, label]) => (
                <option key={code} value={code}>
                  {code}: {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs mb-1" style={{ color: "var(--cream-400)" }}>
              Keywords (optional)
            </label>
            <input
              type="text"
              placeholder="e.g., SPE300, milk, produce..."
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ border: "1px solid var(--cream-300)", color: "var(--hunter-700)" }}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-2 flex-wrap">
        {(
          [
            ["overview", "Overview"],
            ["trends", "Spending Trends"],
            ["recipients", "Top Recipients"],
            ["agencies", "By Agency"],
            ["awards", "Individual Awards"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: view === key ? "var(--hunter-600)" : "var(--cream-50)",
              color: view === key ? "white" : "var(--hunter-600)",
              border: view === key ? "none" : "1px solid var(--cream-300)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "overview" && (
        <OverviewPanel startDate={startDate} endDate={endDate} keywords={keywords} psc={pscParam} />
      )}
      {view === "trends" && (
        <TrendsPanel startDate={startDate} endDate={endDate} keywords={keywords} psc={pscParam} />
      )}
      {view === "recipients" && (
        <CategoryPanel
          category="by_recipient"
          title="Top Recipients"
          startDate={startDate}
          endDate={endDate}
          keywords={keywords}
          psc={pscParam}
        />
      )}
      {view === "agencies" && (
        <CategoryPanel
          category="by_agency"
          title="By Awarding Agency"
          startDate={startDate}
          endDate={endDate}
          keywords={keywords}
          psc={pscParam}
        />
      )}
      {view === "awards" && (
        <AwardsPanel startDate={startDate} endDate={endDate} keywords={keywords} psc={pscParam} />
      )}
    </div>
  );
}

function OverviewPanel({
  startDate,
  endDate,
  keywords,
  psc,
}: {
  startDate: string;
  endDate: string;
  keywords: string;
  psc: string;
}) {
  const [byPsc, setByPsc] = useState<SpendingResult[]>([]);
  const [byAgency, setByAgency] = useState<SpendingResult[]>([]);
  const [byRecipient, setByRecipient] = useState<SpendingResult[]>([]);
  const [timeData, setTimeData] = useState<TimeResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const filters = getSpendingFilters({ startDate, endDate, keywords, psc });

    Promise.all([
      spendingByCategory("psc", filters, 20),
      spendingByCategory("awarding_agency", filters, 10),
      spendingByCategory("recipient", filters, 10),
      spendingOverTime(filters, "fiscal_year"),
    ]).then(([pscData, agencyData, recipientData, timeResp]) => {
      setByPsc(pscData.results || []);
      setByAgency(agencyData.results || []);
      setByRecipient(recipientData.results || []);
      setTimeData(timeResp.results || []);
      setLoading(false);
    }).catch(() => {
      setByPsc([]);
      setByAgency([]);
      setByRecipient([]);
      setTimeData([]);
      setLoading(false);
    });
  }, [startDate, endDate, keywords, psc]);

  if (loading) return <LoadingSpinner />;

  const totalSpending = byPsc.reduce((sum, n) => sum + (n.amount || 0), 0);

  const chartData = timeData
    .filter((d) => d.aggregated_amount > 0)
    .map((d) => ({
      year: `FY${d.time_period.fiscal_year}`,
      amount: d.aggregated_amount,
    }));

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div
          className="rounded-lg border p-6"
          style={{ background: "var(--hunter-700)", borderColor: "var(--hunter-800)" }}
        >
          <div className="text-3xl font-bold text-white">
            ${formatAmount(totalSpending)}
          </div>
          <div className="text-sm mt-1" style={{ color: "var(--hunter-200)" }}>
            Total food/subsistence contract spending
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--hunter-300)" }}>
            {startDate.slice(0, 4)}&ndash;{endDate.slice(0, 4)}
            {psc !== "all" && ` · PSC ${psc}: ${FOOD_PSC_CODES[psc] || psc}`}
          </div>
        </div>

        <div
          className="rounded-lg border p-4"
          style={{ background: "var(--cream-50)", borderColor: "var(--cream-300)" }}
        >
          <h3 className="text-sm font-medium mb-2" style={{ color: "var(--hunter-600)" }}>
            Annual Spending
          </h3>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={chartData}>
              <Bar dataKey="amount" fill="#4a7a4a" radius={[3, 3, 0, 0]} />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 10, fill: "#d4c4ad" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => [formatTooltipAmount(v), "Spending"]}
                contentStyle={{
                  background: "#1e3a1e",
                  border: "none",
                  borderRadius: 8,
                  color: "white",
                  fontSize: 12,
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div
          className="rounded-lg border p-6"
          style={{ background: "var(--cream-50)", borderColor: "var(--cream-300)" }}
        >
          <h3 className="font-semibold mb-4" style={{ color: "var(--hunter-700)" }}>
            By Product Category (PSC)
          </h3>
          <div className="space-y-3">
            {byPsc
              .filter((n) => n.amount > 0)
              .map((n) => (
                <div key={n.code || n.name}>
                  <div className="flex justify-between text-sm">
                    <span className="truncate mr-2" style={{ color: "var(--hunter-600)" }}>
                      {FOOD_PSC_CODES[n.code || ""] || n.name}
                    </span>
                    <span className="font-medium shrink-0" style={{ color: "var(--hunter-700)" }}>
                      ${formatAmount(n.amount)}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-2 rounded-full overflow-hidden"
                    style={{ background: "var(--cream-200)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        background: "var(--hunter-400)",
                        width: `${Math.max(1, (n.amount / (byPsc[0]?.amount || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div
          className="rounded-lg border p-6"
          style={{ background: "var(--cream-50)", borderColor: "var(--cream-300)" }}
        >
          <h3 className="font-semibold mb-4" style={{ color: "var(--hunter-700)" }}>
            Top Awarding Agencies
          </h3>
          <div className="space-y-3">
            {byAgency
              .filter((a) => a.amount > 0)
              .map((a) => (
                <div key={a.name}>
                  <div className="flex justify-between text-sm">
                    <span className="truncate mr-2" style={{ color: "var(--hunter-600)" }}>
                      {a.name}
                    </span>
                    <span className="font-medium shrink-0" style={{ color: "var(--hunter-700)" }}>
                      ${formatAmount(a.amount)}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-2 rounded-full overflow-hidden"
                    style={{ background: "var(--cream-200)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        background: "var(--hunter-300)",
                        width: `${Math.max(1, (a.amount / (byAgency[0]?.amount || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div
        className="rounded-lg border p-6"
        style={{ background: "var(--cream-50)", borderColor: "var(--cream-300)" }}
      >
        <h3 className="font-semibold mb-4" style={{ color: "var(--hunter-700)" }}>
          Top Contract Recipients
        </h3>
        <div className="space-y-3">
          {byRecipient
            .filter((r) => r.amount > 0)
            .map((r, i) => (
              <div key={r.name} className="flex items-center gap-4 text-sm">
                <span className="w-6 text-right font-mono" style={{ color: "var(--cream-400)" }}>
                  {i + 1}
                </span>
                <span className="flex-1 truncate" style={{ color: "var(--hunter-600)" }}>
                  {r.name}
                </span>
                <span className="font-medium" style={{ color: "var(--hunter-700)" }}>
                  ${formatAmount(r.amount)}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function TrendsPanel({
  startDate,
  endDate,
  keywords,
  psc,
}: {
  startDate: string;
  endDate: string;
  keywords: string;
  psc: string;
}) {
  const [yearlyData, setYearlyData] = useState<TimeResult[]>([]);
  const [quarterlyData, setQuarterlyData] = useState<TimeResult[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePsc, setComparePsc] = useState("8905");
  const [compareData, setCompareData] = useState<TimeResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const filters = getSpendingFilters({ startDate, endDate, keywords, psc });

    Promise.all([
      spendingOverTime(filters, "fiscal_year"),
      spendingOverTime(filters, "quarter"),
    ]).then(([yearResp, qtrResp]) => {
      setYearlyData(yearResp.results || []);
      setQuarterlyData(qtrResp.results || []);
      setLoading(false);
    }).catch(() => {
      setYearlyData([]);
      setQuarterlyData([]);
      setLoading(false);
    });
  }, [startDate, endDate, keywords, psc]);

  useEffect(() => {
    if (!compareMode) return;
    const filters = getSpendingFilters({ startDate, endDate, keywords, psc: comparePsc });
    spendingOverTime(filters, "fiscal_year")
      .then((resp) => setCompareData(resp.results || []));
  }, [compareMode, comparePsc, startDate, endDate, keywords]);

  if (loading) return <LoadingSpinner />;

  const yearChart = yearlyData
    .filter((d) => d.aggregated_amount > 0)
    .map((d) => {
      const row: Record<string, unknown> = {
        year: `FY${d.time_period.fiscal_year}`,
        amount: d.aggregated_amount,
      };
      if (compareMode) {
        const match = compareData.find(
          (c) => c.time_period.fiscal_year === d.time_period.fiscal_year
        );
        row.compare = match?.aggregated_amount || 0;
      }
      return row;
    });

  const qtrChart = quarterlyData
    .filter((d) => d.aggregated_amount > 0)
    .map((d) => ({
      quarter: `FY${d.time_period.fiscal_year} Q${d.time_period.quarter}`,
      amount: d.aggregated_amount,
    }));

  const pscLabel = psc === "all" ? "All Subsistence" : `${psc}: ${FOOD_PSC_CODES[psc] || psc}`;

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-4 flex flex-wrap items-center gap-4"
        style={{ background: "var(--cream-50)", borderColor: "var(--cream-300)" }}
      >
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--hunter-700)" }}>
          <input
            type="checkbox"
            checked={compareMode}
            onChange={(e) => setCompareMode(e.target.checked)}
            className="accent-[#4a7a4a]"
          />
          Compare with another category
        </label>
        {compareMode && (
          <select
            className="px-3 py-1.5 rounded-md text-sm"
            style={{ border: "1px solid var(--cream-300)", color: "var(--hunter-700)" }}
            value={comparePsc}
            onChange={(e) => setComparePsc(e.target.value)}
          >
            {Object.entries(FOOD_PSC_CODES)
              .filter(([code]) => code !== psc)
              .map(([code, label]) => (
                <option key={code} value={code}>
                  {code}: {label}
                </option>
              ))}
          </select>
        )}
      </div>

      <div
        className="rounded-lg border p-6"
        style={{ background: "var(--cream-50)", borderColor: "var(--cream-300)" }}
      >
        <h3 className="font-semibold mb-1" style={{ color: "var(--hunter-700)" }}>
          Annual Spending
        </h3>
        <p className="text-xs mb-4" style={{ color: "var(--cream-400)" }}>
          {pscLabel}
          {compareMode && ` vs ${comparePsc}: ${FOOD_PSC_CODES[comparePsc] || comparePsc}`}
        </p>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={yearChart} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8dece" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 12, fill: "#2d4f2d" }}
              axisLine={{ stroke: "#e8dece" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `$${formatAmount(v)}`}
              tick={{ fontSize: 11, fill: "#d4c4ad" }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <Tooltip
              formatter={(v, name) => [
                formatTooltipAmount(v),
                name === "compare"
                  ? FOOD_PSC_CODES[comparePsc] || comparePsc
                  : pscLabel,
              ]}
              contentStyle={{
                background: "#1e3a1e",
                border: "none",
                borderRadius: 8,
                color: "white",
                fontSize: 12,
              }}
            />
            <Bar dataKey="amount" fill="#4a7a4a" name={pscLabel} radius={[4, 4, 0, 0]} />
            {compareMode && (
              <Bar
                dataKey="compare"
                fill="#7aad7a"
                name={FOOD_PSC_CODES[comparePsc] || comparePsc}
                radius={[4, 4, 0, 0]}
              />
            )}
            {compareMode && <Legend wrapperStyle={{ fontSize: 12 }} />}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div
        className="rounded-lg border p-6"
        style={{ background: "var(--cream-50)", borderColor: "var(--cream-300)" }}
      >
        <h3 className="font-semibold mb-1" style={{ color: "var(--hunter-700)" }}>
          Quarterly Trend
        </h3>
        <p className="text-xs mb-4" style={{ color: "var(--cream-400)" }}>
          {pscLabel}
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={qtrChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8dece" />
            <XAxis
              dataKey="quarter"
              tick={{ fontSize: 10, fill: "#d4c4ad" }}
              axisLine={{ stroke: "#e8dece" }}
              tickLine={false}
              interval={3}
            />
            <YAxis
              tickFormatter={(v) => `$${formatAmount(v)}`}
              tick={{ fontSize: 11, fill: "#d4c4ad" }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <Tooltip
              formatter={(v) => [formatTooltipAmount(v), "Spending"]}
              contentStyle={{
                background: "#1e3a1e",
                border: "none",
                borderRadius: 8,
                color: "white",
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="amount"
              stroke="#355e35"
              strokeWidth={2}
              dot={{ fill: "#4a7a4a", r: 3 }}
              activeDot={{ r: 5, fill: "#1e3a1e" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CategoryPanel({
  category,
  title,
  startDate,
  endDate,
  keywords,
  psc,
}: {
  category: string;
  title: string;
  startDate: string;
  endDate: string;
  keywords: string;
  psc: string;
}) {
  const [results, setResults] = useState<SpendingResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const filters = getSpendingFilters({ startDate, endDate, keywords, psc });
    const spendingCategory = category === "by_agency" ? "awarding_agency" : "recipient";

    spendingByCategory(spendingCategory, filters, 50)
      .then((data) => {
        setResults(data.results || []);
        setLoading(false);
      })
      .catch(() => {
        setResults([]);
        setLoading(false);
      });
  }, [category, startDate, endDate, keywords, psc]);

  if (loading) return <LoadingSpinner />;

  const total = results.reduce((sum, r) => sum + (r.amount || 0), 0);
  const chartData = results.filter((r) => r.amount > 0).slice(0, 15).map((r) => ({
    name: r.name.length > 25 ? r.name.slice(0, 22) + "..." : r.name,
    amount: r.amount,
  }));

  return (
    <div className="space-y-6">
      {chartData.length > 0 && (
        <div
          className="rounded-lg border p-6"
          style={{ background: "var(--cream-50)", borderColor: "var(--cream-300)" }}
        >
          <h3 className="font-semibold mb-4" style={{ color: "var(--hunter-700)" }}>
            {title}
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 36)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8dece" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => `$${formatAmount(v)}`}
                tick={{ fontSize: 11, fill: "#d4c4ad" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={180}
                tick={{ fontSize: 11, fill: "#2d4f2d" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => [formatTooltipAmount(v), "Spending"]}
                contentStyle={{
                  background: "#1e3a1e",
                  border: "none",
                  borderRadius: 8,
                  color: "white",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="amount" fill="#4a7a4a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: "var(--cream-300)" }}
      >
        <div
          className="p-4 border-b"
          style={{
            background: "var(--hunter-700)",
            borderColor: "var(--hunter-800)",
          }}
        >
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="text-sm" style={{ color: "var(--hunter-200)" }}>
            Total: ${formatAmount(total)}
          </p>
        </div>
        <table className="w-full text-sm">
          <thead
            className="border-b"
            style={{ background: "var(--hunter-50)", borderColor: "var(--cream-300)" }}
          >
            <tr>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--hunter-600)" }}>
                #
              </th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--hunter-600)" }}>
                Name
              </th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--hunter-600)" }}>
                Amount
              </th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--hunter-600)" }}>
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {results
              .filter((r) => r.amount > 0)
              .map((r, i) => (
                <tr
                  key={r.name + i}
                  className="transition-colors"
                  style={{
                    background: i % 2 === 0 ? "var(--cream-50)" : "white",
                    borderBottom: "1px solid var(--cream-200)",
                  }}
                >
                  <td className="px-4 py-3" style={{ color: "var(--cream-400)" }}>
                    {i + 1}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--hunter-700)" }}>
                    {r.name}
                  </td>
                  <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--hunter-700)" }}>
                    ${formatAmount(r.amount)}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--cream-400)" }}>
                    {((r.amount / total) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AwardsPanel({
  startDate,
  endDate,
  keywords,
  psc,
}: {
  startDate: string;
  endDate: string;
  keywords: string;
  psc: string;
}) {
  const [awards, setAwards] = useState<Award[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const filters = getSpendingFilters({ startDate, endDate, keywords, psc });

    searchAwards(filters, page, 25)
      .then((data) => {
        setAwards(data.results || []);
        setLoading(false);
      })
      .catch(() => {
        setAwards([]);
        setLoading(false);
      });
  }, [startDate, endDate, page, keywords, psc]);

  if (loading) return <LoadingSpinner />;

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: "var(--cream-300)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead
            className="border-b"
            style={{ background: "var(--hunter-50)", borderColor: "var(--cream-300)" }}
          >
            <tr>
              {["Award ID", "Recipient", "Amount", "Description", "Agency", "Date", "State"].map(
                (h) => (
                  <th
                    key={h}
                    className={`px-4 py-3 font-medium ${h === "Amount" ? "text-right" : "text-left"}`}
                    style={{ color: "var(--hunter-600)" }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {awards.map((a, i) => (
              <tr
                key={a["Award ID"] + i}
                style={{
                  background: i % 2 === 0 ? "var(--cream-50)" : "white",
                  borderBottom: "1px solid var(--cream-200)",
                }}
              >
                <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--hunter-500)" }}>
                  {a["Award ID"]}
                </td>
                <td className="px-4 py-3 max-w-[200px] truncate" style={{ color: "var(--hunter-700)" }}>
                  {a["Recipient Name"]}
                </td>
                <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--hunter-700)" }}>
                  ${formatAmount(a["Award Amount"] || 0)}
                </td>
                <td className="px-4 py-3 max-w-[250px] truncate" style={{ color: "var(--hunter-600)" }}>
                  {a.Description}
                </td>
                <td className="px-4 py-3 max-w-[150px] truncate text-xs" style={{ color: "var(--cream-400)" }}>
                  {a.awarding_agency}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--hunter-600)" }}>
                  {a["Start Date"]}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--hunter-600)" }}>
                  {a["Place of Performance State Code"]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="flex items-center justify-between border-t px-4 py-3"
        style={{
          borderColor: "var(--cream-300)",
          background: "var(--cream-50)",
        }}
      >
        <button
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-3 py-1.5 text-sm rounded disabled:opacity-30"
          style={{
            border: "1px solid var(--cream-300)",
            color: "var(--hunter-600)",
          }}
        >
          Previous
        </button>
        <span className="text-sm" style={{ color: "var(--cream-400)" }}>
          Page {page}
        </span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={awards.length < 25}
          className="px-3 py-1.5 text-sm rounded disabled:opacity-30"
          style={{
            border: "1px solid var(--cream-300)",
            color: "var(--hunter-600)",
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div
        className="animate-spin h-8 w-8 border-4 border-t-transparent rounded-full"
        style={{ borderColor: "var(--hunter-400)", borderTopColor: "transparent" }}
      />
    </div>
  );
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return amount.toFixed(0);
}
