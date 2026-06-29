"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  opportunities as allOpportunities,
  getOpportunityStats,
  daysUntilDeadline,
  opportunitiesMeta,
  type SamOpportunity,
} from "@/lib/opportunities";
import {
  distributorProfile,
  scoreOpportunityFit,
  type OpportunityFit,
} from "@/lib/opportunity-matching";
import { FOOD_PSC_CODES, NAICS_LABELS } from "@/lib/usaspending";

function toggleFilterValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
}

type SortKey =
  | "responseDeadline"
  | "fit"
  | "pscCode"
  | "title"
  | "noticeType"
  | "department"
  | "state";

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "responseDeadline", label: "Deadline" },
  { key: "fit", label: "Fit" },
  { key: "pscCode", label: "Product Category" },
  { key: "title", label: "Title" },
  { key: "noticeType", label: "Type" },
  { key: "department", label: "Department" },
  { key: "state", label: "State" },
];

function getSortValue(opp: SamOpportunity, key: SortKey): string {
  if (key === "state") return opp.placeOfPerformance?.state || "";
  if (key === "fit") return String(scoreOpportunityFit(opp).score).padStart(3, "0");
  if (key === "pscCode") return FOOD_PSC_CODES[opp.pscCode] || opp.pscCode;
  const v = opp[key];
  return v == null ? "" : String(v);
}

export function OpenOpportunities() {
  const [noticeTypeFilter, setNoticeTypeFilter] = useState<string[]>([]);
  const [pscFilter, setPscFilter] = useState<string[]>([]);
  const [naicsFilter, setNaicsFilter] = useState<string[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [showMatchesOnly, setShowMatchesOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortKey>("responseDeadline");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedOpp, setSelectedOpp] = useState<SamOpportunity | null>(null);

  const stats = useMemo(() => getOpportunityStats(), []);

  const filtered = useMemo(() => {
    return allOpportunities
      .filter((opp) => {
        if (showMatchesOnly && scoreOpportunityFit(opp).level === "low") return false;
        if (noticeTypeFilter.length > 0 && !noticeTypeFilter.includes(opp.noticeType)) return false;
        if (pscFilter.length > 0 && !pscFilter.includes(opp.pscCode)) return false;
        if (naicsFilter.length > 0 && !naicsFilter.includes(opp.naicsCode)) return false;
        if (departmentFilter.length > 0 && !departmentFilter.includes(opp.department || "")) return false;
        if (stateFilter.length > 0 && !stateFilter.includes(opp.placeOfPerformance?.state || "")) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const haystack = `${opp.title} ${opp.description || ""} ${opp.solicitationNumber}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aVal = getSortValue(a, sortCol).toLowerCase();
        const bVal = getSortValue(b, sortCol).toLowerCase();
        const dir = sortDir === "asc" ? 1 : -1;
        return aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: "base" }) * dir;
      });
  }, [noticeTypeFilter, pscFilter, naicsFilter, departmentFilter, stateFilter, showMatchesOnly, search, sortCol, sortDir]);

  const matchCount = useMemo(
    () => allOpportunities.filter((opp) => scoreOpportunityFit(opp).level !== "low").length,
    []
  );

  const noticeTypes = useMemo(
    () => stats.byNoticeType.map((t) => t.noticeType).filter(Boolean),
    [stats]
  );
  const naicsCodes = useMemo(
    () => Array.from(new Set(allOpportunities.map((o) => o.naicsCode).filter(Boolean))).sort(),
    []
  );
  const pscCodes = useMemo(
    () => Array.from(new Set(allOpportunities.map((o) => o.pscCode).filter(Boolean))).sort(),
    []
  );
  const departments = useMemo(
    () => stats.byDepartment.map((d) => d.department).filter(Boolean),
    [stats]
  );
  const states = useMemo(
    () => Array.from(new Set(allOpportunities.map((o) => o.placeOfPerformance?.state).filter(Boolean) as string[])).sort(),
    []
  );

  function toggleSort(col: SortKey) {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const sortIndicator = (col: SortKey) =>
    sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="space-y-6">
      <section
        className="rounded-lg border p-4"
        style={{ background: "var(--cream-50)", borderColor: "var(--cream-300)" }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold" style={{ color: "var(--hunter-700)" }}>
                {distributorProfile.name}
              </h2>
              <span
                className="rounded px-2 py-0.5 text-xs font-semibold"
                style={{ background: "var(--hunter-100)", color: "var(--hunter-700)" }}
              >
                {matchCount} potential matches
              </span>
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--hunter-600)" }}>
              {distributorProfile.summary}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {distributorProfile.capabilities.map((capability) => (
                <span
                  key={capability}
                  className="rounded border px-2 py-1 text-xs"
                  style={{
                    borderColor: "var(--cream-300)",
                    background: "white",
                    color: "var(--hunter-600)",
                  }}
                >
                  {capability}
                </span>
              ))}
            </div>
          </div>
          <div
            className="flex shrink-0 overflow-hidden rounded-md border"
            style={{ borderColor: "var(--cream-300)" }}
          >
            <button
              type="button"
              className="px-3 py-2 text-sm font-medium"
              style={{
                background: showMatchesOnly ? "white" : "var(--hunter-600)",
                color: showMatchesOnly ? "var(--hunter-600)" : "white",
              }}
              onClick={() => setShowMatchesOnly(false)}
            >
              All opportunities
            </button>
            <button
              type="button"
              className="px-3 py-2 text-sm font-medium"
              style={{
                background: showMatchesOnly ? "var(--hunter-600)" : "white",
                color: showMatchesOnly ? "white" : "var(--hunter-600)",
              }}
              onClick={() => setShowMatchesOnly(true)}
            >
              Profile matches
            </button>
          </div>
        </div>
      </section>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          className="rounded-lg border p-4"
          style={{ background: "var(--hunter-700)", borderColor: "var(--hunter-800)" }}
        >
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <div className="text-sm" style={{ color: "var(--hunter-200)" }}>
            Open Opportunities
          </div>
        </div>
        <div
          className="rounded-lg border p-4"
          style={{
            background: stats.expiringWithin7Days > 0 ? "#fef3c7" : "var(--cream-50)",
            borderColor: stats.expiringWithin7Days > 0 ? "#f59e0b" : "var(--cream-300)",
          }}
        >
          <div
            className="text-2xl font-bold"
            style={{ color: stats.expiringWithin7Days > 0 ? "#b45309" : "var(--hunter-600)" }}
          >
            {stats.expiringWithin7Days}
          </div>
          <div className="text-sm" style={{ color: stats.expiringWithin7Days > 0 ? "#92400e" : "var(--cream-400)" }}>
            Closing Within 7 Days
          </div>
        </div>
        {stats.byNoticeType.slice(0, 2).map((t) => (
          <div
            key={t.noticeType}
            className="rounded-lg border p-4"
            style={{ background: "var(--cream-50)", borderColor: "var(--cream-300)" }}
          >
            <div className="text-2xl font-bold" style={{ color: "var(--hunter-600)" }}>
              {t.count}
            </div>
            <div className="text-sm" style={{ color: "var(--cream-400)" }}>
              {t.noticeType}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        className="rounded-lg border p-4"
        style={{ background: "var(--cream-50)", borderColor: "var(--cream-300)" }}
      >
        <div className="flex flex-wrap gap-3">
          <MultiSelectFilter
            label="Types"
            allLabel="All Types"
            options={noticeTypes}
            selected={noticeTypeFilter}
            onToggle={(v) => setNoticeTypeFilter((c) => toggleFilterValue(c, v))}
            onClear={() => setNoticeTypeFilter([])}
          />
          <MultiSelectFilter
            label="PSC"
            allLabel="All PSC"
            options={pscCodes}
            formatOption={(code) => `${code} - ${FOOD_PSC_CODES[code] || code}`}
            selected={pscFilter}
            onToggle={(v) => setPscFilter((c) => toggleFilterValue(c, v))}
            onClear={() => setPscFilter([])}
          />
          <MultiSelectFilter
            label="NAICS"
            allLabel="All NAICS"
            options={naicsCodes}
            formatOption={(code) => `${code} - ${NAICS_LABELS[code] || code}`}
            selected={naicsFilter}
            onToggle={(v) => setNaicsFilter((c) => toggleFilterValue(c, v))}
            onClear={() => setNaicsFilter([])}
          />
          <MultiSelectFilter
            label="Departments"
            allLabel="All Departments"
            options={departments}
            selected={departmentFilter}
            onToggle={(v) => setDepartmentFilter((c) => toggleFilterValue(c, v))}
            onClear={() => setDepartmentFilter([])}
          />
          <MultiSelectFilter
            label="States"
            allLabel="All States"
            options={states}
            selected={stateFilter}
            onToggle={(v) => setStateFilter((c) => toggleFilterValue(c, v))}
            onClear={() => setStateFilter([])}
          />
          <input
            type="text"
            placeholder="Search title, description, sol #..."
            className="px-3 py-2 rounded-md text-sm min-w-[230px] focus:outline-none focus:ring-2"
            style={{
              border: "1px solid var(--cream-300)",
              background: "white",
              color: "var(--hunter-700)",
            }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: "var(--cream-300)" }}
      >
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead
              className="sticky top-0 z-10 border-b"
              style={{ background: "var(--hunter-50)", borderColor: "var(--cream-300)" }}
            >
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left font-medium cursor-pointer select-none"
                    style={{ background: "var(--hunter-50)", color: "var(--hunter-600)" }}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    {sortIndicator(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="px-4 py-8 text-center"
                    style={{ color: "var(--cream-400)" }}
                  >
                    No opportunities found
                  </td>
                </tr>
              ) : (
                filtered.map((opp, i) => {
                  const days = daysUntilDeadline(opp.responseDeadline);
                  const fit = scoreOpportunityFit(opp);
                  return (
                    <tr
                      key={opp.noticeId}
                      className="cursor-pointer transition-colors"
                      style={{
                        background: i % 2 === 0 ? "var(--cream-50)" : "white",
                        borderBottom: "1px solid var(--cream-200)",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hunter-50)")}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = i % 2 === 0 ? "var(--cream-50)" : "white")
                      }
                      onClick={() => setSelectedOpp(opp)}
                    >
                      <td className="px-4 py-3">
                        <DeadlineBadge deadline={opp.responseDeadline} days={days} />
                      </td>
                      <td className="px-4 py-3">
                        <FitBadge fit={fit} />
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        style={{ color: "var(--hunter-600)" }}
                        title={opp.pscCode}
                      >
                        {FOOD_PSC_CODES[opp.pscCode] || opp.pscCode || "—"}
                      </td>
                      <td
                        className="px-4 py-3 max-w-[280px] truncate"
                        style={{ color: "var(--hunter-700)" }}
                        title={opp.title}
                      >
                        {opp.title}
                      </td>
                      <td className="px-4 py-3">
                        <NoticeTypeBadge type={opp.noticeType} />
                      </td>
                      <td
                        className="px-4 py-3 text-xs max-w-[140px] truncate"
                        style={{ color: "var(--hunter-700)" }}
                        title={opp.department || ""}
                      >
                        {opp.department || "—"}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--hunter-700)" }}>
                        {opp.placeOfPerformance?.state || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div
          className="border-t px-4 py-3 text-sm flex justify-between"
          style={{
            borderColor: "var(--cream-300)",
            background: "var(--cream-50)",
            color: "var(--cream-400)",
          }}
        >
          <span>{filtered.length} opportunities</span>
          <span>
            Data as of{" "}
            {new Date(opportunitiesMeta.fetchedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      {selectedOpp && (
        <OpportunityDetail opp={selectedOpp} onClose={() => setSelectedOpp(null)} />
      )}
    </div>
  );
}

function DeadlineBadge({ deadline, days }: { deadline: string | null; days: number | null }) {
  if (!deadline || days === null) {
    return <span className="text-xs" style={{ color: "var(--cream-400)" }}>—</span>;
  }

  let bg: string;
  let text: string;
  if (days < 0) {
    bg = "var(--cream-200)";
    text = "var(--cream-400)";
  } else if (days <= 7) {
    bg = "#fee2e2";
    text = "#991b1b";
  } else if (days <= 14) {
    bg = "#fef3c7";
    text = "#92400e";
  } else {
    bg = "#dcfce7";
    text = "#166534";
  }

  const dateStr = new Date(deadline).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <span
      className="inline-flex flex-col items-start px-2 py-1 rounded text-xs font-medium"
      style={{ background: bg, color: text }}
    >
      <span>{dateStr}</span>
      <span className="text-[10px] opacity-80">
        {days < 0 ? "Closed" : days === 0 ? "Today" : `${days}d left`}
      </span>
    </span>
  );
}

function FitBadge({ fit }: { fit: OpportunityFit }) {
  if (fit.level === "low") {
    return <span className="text-xs" style={{ color: "var(--cream-400)" }}>—</span>;
  }

  const strong = fit.level === "strong";
  return (
    <span
      className="inline-flex whitespace-nowrap rounded px-2 py-1 text-xs font-semibold"
      style={{
        background: strong ? "#dcfce7" : "#fef3c7",
        color: strong ? "#166534" : "#92400e",
      }}
      title={`${fit.score}/100`}
    >
      {strong ? "Strong fit" : "Possible fit"}
    </span>
  );
}

function NoticeTypeBadge({ type }: { type: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    Solicitation: { bg: "var(--hunter-100)", text: "var(--hunter-700)" },
    Presolicitation: { bg: "#fef3c7", text: "#92400e" },
    "Combined Synopsis/Solicitation": { bg: "#dbeafe", text: "#1e40af" },
    "Sources Sought": { bg: "var(--cream-200)", text: "var(--cream-400)" },
  };
  const s = styles[type] || { bg: "var(--cream-200)", text: "var(--cream-400)" };
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.text }}
    >
      {type === "Combined Synopsis/Solicitation" ? "Combined" : type}
    </span>
  );
}

function OpportunityDetail({
  opp,
  onClose,
}: {
  opp: SamOpportunity;
  onClose: () => void;
}) {
  const days = daysUntilDeadline(opp.responseDeadline);
  const fit = scoreOpportunityFit(opp);

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
          <h2 className="text-lg font-bold text-white pr-4">{opp.title}</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-2xl leading-none flex-shrink-0"
          >
            &times;
          </button>
        </div>
        <div className="p-6 space-y-4">
          <a
            href={opp.samUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center px-4 py-3 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ background: "var(--hunter-600)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hunter-700)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--hunter-600)")}
          >
            View Full Solicitation & Documents on SAM.gov →
          </a>

          <div
            className="rounded-lg border p-4"
            style={{
              background: fit.level === "strong" ? "#f0fdf4" : fit.level === "possible" ? "#fffbeb" : "white",
              borderColor: fit.level === "strong" ? "#bbf7d0" : fit.level === "possible" ? "#fde68a" : "var(--cream-300)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold" style={{ color: "var(--hunter-700)" }}>
                Profile fit
              </div>
              <FitBadge fit={fit} />
            </div>
            <div className="mt-2 text-xs font-medium" style={{ color: "var(--cream-400)" }}>
              Score {fit.score}/100
            </div>
            <ul className="mt-2 space-y-1 text-sm" style={{ color: "var(--hunter-600)" }}>
              {fit.reasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          </div>

          {opp.responseDeadline && (
            <div
              className="rounded-lg border p-3 flex items-center justify-between"
              style={{
                background:
                  days !== null && days <= 7
                    ? "#fef2f2"
                    : days !== null && days <= 14
                      ? "#fffbeb"
                      : "#f0fdf4",
                borderColor:
                  days !== null && days <= 7
                    ? "#fecaca"
                    : days !== null && days <= 14
                      ? "#fde68a"
                      : "#bbf7d0",
              }}
            >
              <div>
                <div
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{
                    color:
                      days !== null && days <= 7
                        ? "#991b1b"
                        : days !== null && days <= 14
                          ? "#92400e"
                          : "#166534",
                  }}
                >
                  Response Deadline
                </div>
                <div
                  className="text-sm font-semibold mt-0.5"
                  style={{
                    color:
                      days !== null && days <= 7
                        ? "#991b1b"
                        : days !== null && days <= 14
                          ? "#92400e"
                          : "#166534",
                  }}
                >
                  {new Date(opp.responseDeadline).toLocaleString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short",
                  })}
                </div>
              </div>
              {days !== null && (
                <div
                  className="text-2xl font-bold"
                  style={{
                    color:
                      days <= 7 ? "#991b1b" : days <= 14 ? "#92400e" : "#166534",
                  }}
                >
                  {days < 0 ? "Closed" : days === 0 ? "Today" : `${days}d`}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Solicitation #" value={opp.solicitationNumber} />
            <Field label="Notice Type" value={opp.noticeType} />
            <Field label="NAICS" value={opp.naicsCode ? `${opp.naicsCode} - ${NAICS_LABELS[opp.naicsCode] || ""}` : null} />
            <Field label="PSC Code" value={opp.pscCode} />
            <Field label="Department" value={opp.department} />
            <Field label="Contracting Office" value={opp.contractingOffice} />
            <Field
              label="Place of Performance"
              value={
                opp.placeOfPerformance
                  ? [opp.placeOfPerformance.city, opp.placeOfPerformance.state, opp.placeOfPerformance.country]
                      .filter(Boolean)
                      .join(", ")
                  : null
              }
            />
            <Field label="Posted Date" value={opp.postedDate} />
            <Field label="Archive Date" value={opp.archiveDate} />
          </div>

          {opp.pointOfContact && (opp.pointOfContact.name || opp.pointOfContact.email) && (
            <div>
              <div
                className="text-xs font-medium uppercase tracking-wide mb-1"
                style={{ color: "var(--cream-400)" }}
              >
                Point of Contact
              </div>
              <div
                className="text-sm rounded p-3"
                style={{
                  background: "var(--cream-100)",
                  color: "var(--hunter-700)",
                  border: "1px solid var(--cream-300)",
                }}
              >
                {opp.pointOfContact.name && <div className="font-medium">{opp.pointOfContact.name}</div>}
                {opp.pointOfContact.email && <div>{opp.pointOfContact.email}</div>}
                {opp.pointOfContact.phone && <div>{opp.pointOfContact.phone}</div>}
              </div>
            </div>
          )}

          {opp.description && (
            <div>
              <div
                className="text-xs font-medium uppercase tracking-wide mb-1"
                style={{ color: "var(--cream-400)" }}
              >
                Description
              </div>
              <div className="text-sm" style={{ color: "var(--hunter-700)" }}>
                {opp.description}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MultiSelectFilter({
  label,
  allLabel,
  options,
  selected,
  onToggle,
  onClear,
  formatOption,
}: {
  label: string;
  allLabel: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  formatOption?: (value: string) => string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? formatOption
          ? formatOption(selected[0])
          : selected[0]
        : `${selected.length} ${label}`;

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
        className="list-none cursor-pointer select-none rounded-md px-3 py-2 text-sm min-w-[150px]"
        style={{
          border: "1px solid var(--cream-300)",
          background: "white",
          color: "var(--hunter-700)",
        }}
      >
        <span className="flex items-center justify-between gap-3">
          <span className="truncate">{summary}</span>
          <span aria-hidden="true" style={{ color: "var(--cream-400)" }}>
            ▾
          </span>
        </span>
      </summary>
      <div
        className="absolute left-0 z-20 mt-2 w-72 rounded-md border p-2 shadow-lg"
        style={{ background: "white", borderColor: "var(--cream-300)" }}
      >
        <div
          className="flex items-center justify-between border-b pb-2 mb-2"
          style={{ borderColor: "var(--cream-200)" }}
        >
          <span className="text-xs font-medium uppercase" style={{ color: "var(--cream-400)" }}>
            {label}
          </span>
          {selected.length > 0 && (
            <button
              type="button"
              className="text-xs font-medium"
              style={{ color: "var(--hunter-500)" }}
              onClick={onClear}
            >
              Clear
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {options.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
              style={{ color: "var(--hunter-700)" }}
            >
              <input
                type="checkbox"
                className="accent-[#4a7a4a]"
                checked={selected.includes(option)}
                onChange={() => onToggle(option)}
              />
              <span className="truncate">{formatOption ? formatOption(option) : option}</span>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
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
