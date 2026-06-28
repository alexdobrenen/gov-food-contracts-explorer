"use client";

import { useState, useMemo } from "react";
import {
  contracts as allContracts,
  getContractStats,
  type ContractRow,
} from "@/lib/contracts";

type Contract = ContractRow;

const SEARCH_FIELDS: Array<keyof Contract> = [
  "contract_number",
  "contractor_name",
  "major_customers",
  "commodity",
];

export function DLAContracts() {
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [commodityFilter, setCommodityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortCol, setSortCol] = useState("contract_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

  const stats = useMemo(() => getContractStats(), []);

  const contracts = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return allContracts
      .filter((contract) => {
        if (regionFilter && contract.region !== regionFilter) return false;
        if (typeFilter && contract.contract_type !== typeFilter) return false;
        if (commodityFilter && contract.commodity !== commodityFilter) return false;
        if (statusFilter && contract.status !== statusFilter) return false;
        if (!searchTerm) return true;

        return SEARCH_FIELDS.some((field) => {
          const value = contract[field];
          return typeof value === "string" && value.toLowerCase().includes(searchTerm);
        });
      })
      .sort((a, b) => {
        const aValue = a[sortCol as keyof Contract];
        const bValue = b[sortCol as keyof Contract];
        const normalizedA = aValue == null ? "" : String(aValue).toLowerCase();
        const normalizedB = bValue == null ? "" : String(bValue).toLowerCase();
        const direction = sortDir === "asc" ? 1 : -1;

        return normalizedA.localeCompare(normalizedB, undefined, {
          numeric: true,
          sensitivity: "base",
        }) * direction;
      });
  }, [commodityFilter, regionFilter, search, sortCol, sortDir, statusFilter, typeFilter]);

  const regions = useMemo(
    () => stats?.byRegion?.map((r) => r.region).filter(Boolean) || [],
    [stats]
  );
  const types = useMemo(
    () => stats?.byType?.map((t) => t.contract_type).filter(Boolean) || [],
    [stats]
  );
  const commodities = useMemo(
    () => stats?.byCommodity?.map((c) => c.commodity).filter(Boolean) || [],
    [stats]
  );

  function toggleSort(col: string) {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const sortIndicator = (col: string) =>
    sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div
            className="rounded-lg border p-4"
            style={{
              background: "var(--hunter-700)",
              borderColor: "var(--hunter-800)",
            }}
          >
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-sm" style={{ color: "var(--hunter-200)" }}>
              Total Contracts
            </div>
          </div>
          {stats.byType?.map((t) => (
            <div
              key={t.contract_type}
              className="rounded-lg border p-4"
              style={{
                background: "var(--cream-50)",
                borderColor: "var(--cream-300)",
              }}
            >
              <div
                className="text-2xl font-bold"
                style={{ color: "var(--hunter-600)" }}
              >
                {t.count}
              </div>
              <div className="text-sm" style={{ color: "var(--cream-400)" }}>
                {t.contract_type}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div
        className="rounded-lg border p-4"
        style={{
          background: "var(--cream-50)",
          borderColor: "var(--cream-300)",
        }}
      >
        <div className="flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="Search contracts, vendors, installations..."
            className="flex-1 min-w-[250px] px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2"
            style={{
              border: "1px solid var(--cream-300)",
              background: "white",
              color: "var(--hunter-700)",
            }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="px-3 py-2 rounded-md text-sm"
            style={{
              border: "1px solid var(--cream-300)",
              background: "white",
              color: "var(--hunter-700)",
            }}
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
          >
            <option value="">All Regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select
            className="px-3 py-2 rounded-md text-sm"
            style={{
              border: "1px solid var(--cream-300)",
              background: "white",
              color: "var(--hunter-700)",
            }}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            className="px-3 py-2 rounded-md text-sm"
            style={{
              border: "1px solid var(--cream-300)",
              background: "white",
              color: "var(--hunter-700)",
            }}
            value={commodityFilter}
            onChange={(e) => setCommodityFilter(e.target.value)}
          >
            <option value="">All Commodities</option>
            {commodities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            className="px-3 py-2 rounded-md text-sm"
            style={{
              border: "1px solid var(--cream-300)",
              background: "white",
              color: "var(--hunter-700)",
            }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Contract table */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: "var(--cream-300)" }}
      >
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead
              className="sticky top-0 z-10 border-b"
              style={{
                background: "var(--hunter-50)",
                borderColor: "var(--cream-300)",
              }}
            >
              <tr>
                {[
                  { key: "contract_number", label: "Contract #" },
                  { key: "contractor_name", label: "Vendor" },
                  { key: "region", label: "Region" },
                  { key: "commodity", label: "Commodity" },
                  { key: "contract_type", label: "Type" },
                  { key: "award_date", label: "Award Date" },
                  { key: "status", label: "Status" },
                ].map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left font-medium cursor-pointer select-none"
                    style={{
                      background: "var(--hunter-50)",
                      color: "var(--hunter-600)",
                    }}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    {sortIndicator(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contracts.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center"
                    style={{ color: "var(--cream-400)" }}
                  >
                    No contracts found
                  </td>
                </tr>
              ) : (
                contracts.map((c, i) => (
                  <tr
                    key={c.contract_number}
                    className="cursor-pointer transition-colors"
                    style={{
                      background:
                        i % 2 === 0 ? "var(--cream-50)" : "white",
                      borderBottom: "1px solid var(--cream-200)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--hunter-50)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background =
                        i % 2 === 0 ? "var(--cream-50)" : "white")
                    }
                    onClick={() => setSelectedContract(c)}
                  >
                    <td
                      className="px-4 py-3 font-mono font-medium"
                      style={{ color: "var(--hunter-500)" }}
                    >
                      {c.contract_number}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--hunter-700)" }}>
                      {c.contractor_name || "—"}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--hunter-700)" }}>
                      {c.region || "—"}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--hunter-700)" }}>
                      {c.commodity || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge type={c.contract_type} />
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--hunter-700)" }}>
                      {c.award_date || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div
          className="border-t px-4 py-3 text-sm"
          style={{
            borderColor: "var(--cream-300)",
            background: "var(--cream-50)",
            color: "var(--cream-400)",
          }}
        >
          {contracts.length} contracts
        </div>
      </div>

      {selectedContract && (
        <ContractDetail
          contract={selectedContract}
          onClose={() => setSelectedContract(null)}
        />
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: string | null }) {
  const styles: Record<string, { bg: string; text: string }> = {
    "Prime Vendor": { bg: "var(--hunter-100)", text: "var(--hunter-700)" },
    "Market Fresh": { bg: "#e8f5e9", text: "#2e7d32" },
    Beverage: { bg: "#fff8e1", text: "#f57f17" },
  };
  const s = styles[type || ""] || { bg: "var(--cream-200)", text: "var(--cream-400)" };
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: s.bg, color: s.text }}
    >
      {type || "—"}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const isActive = status === "Active";
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-medium"
      style={{
        background: isActive ? "var(--hunter-100)" : "var(--cream-200)",
        color: isActive ? "var(--hunter-600)" : "var(--cream-400)",
      }}
    >
      {status || "—"}
    </span>
  );
}

function ContractDetail({
  contract: c,
  onClose,
}: {
  contract: Contract;
  onClose: () => void;
}) {
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
          <h2 className="text-lg font-bold text-white">{c.contract_number}</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Vendor" value={c.contractor_name} />
            <Field label="City/State" value={c.contractor_city_state} />
            <Field label="CAGE Code" value={c.contractor_cage} />
            <Field label="Solicitation #" value={c.solicitation_number} />
            <Field label="Region" value={c.region} />
            <Field label="CONUS/OCONUS" value={c.conus_oconus} />
            <Field label="Contract Type" value={c.contract_type} />
            <Field label="DLA Type" value={c.dla_contract_type} />
            <Field label="Commodity" value={c.commodity} />
            <Field label="Status" value={c.status} />
            <Field label="Award Date" value={c.award_date} />
            <Field
              label="Navy Ships?"
              value={
                c.includes_navy_ships === 1
                  ? "Yes"
                  : c.includes_navy_ships === 0
                    ? "No"
                    : null
              }
            />
          </div>
          {c.major_customers && (
            <div>
              <div
                className="text-xs font-medium uppercase tracking-wide mb-1"
                style={{ color: "var(--cream-400)" }}
              >
                Major Customers
              </div>
              <div
                className="text-sm rounded p-3"
                style={{
                  background: "var(--cream-100)",
                  color: "var(--hunter-700)",
                  border: "1px solid var(--cream-300)",
                }}
              >
                {c.major_customers}
              </div>
            </div>
          )}
          {c.description && (
            <div>
              <div
                className="text-xs font-medium uppercase tracking-wide mb-1"
                style={{ color: "var(--cream-400)" }}
              >
                Description
              </div>
              <div className="text-sm" style={{ color: "var(--hunter-700)" }}>
                {c.description}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
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
