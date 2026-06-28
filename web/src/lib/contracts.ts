import contractsData from "@/data/contracts.json";

export interface ContractRow {
  contract_number: string;
  solicitation_number: string | null;
  contract_type: string | null;
  region: string | null;
  contractor_name: string | null;
  contractor_address: string | null;
  contractor_city_state: string | null;
  contractor_cage: string | null;
  period_of_performance_start: string | null;
  period_of_performance_end: string | null;
  award_date: string | null;
  obligated_amount: number | null;
  total_amount: number | null;
  naics_code: string | null;
  set_aside_type: string | null;
  description: string | null;
  commodity: string | null;
  status: string | null;
  conus_oconus: string | null;
  includes_navy_ships: number | null;
  major_customers: string | null;
  admin_catalog_numbers: string | null;
  dla_contract_type: string | null;
  detail_url: string | null;
  source: string | null;
  source_url?: string | null;
  scraped_at?: string | null;
}

export interface ContractStats {
  total: number;
  byType: { contract_type: string; count: number }[];
  byRegion: { region: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byCommodity: { commodity: string; count: number }[];
}

export const contracts = contractsData as ContractRow[];

function countBy<K extends keyof ContractRow>(
  rows: ContractRow[],
  key: K
): Array<Record<K, string> & { count: number }> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ [key]: value, count }) as Record<K, string> & { count: number });
}

export function getContractStats(): ContractStats {
  return {
    total: contracts.length,
    byType: countBy(contracts, "contract_type") as ContractStats["byType"],
    byRegion: countBy(contracts, "region") as ContractStats["byRegion"],
    byStatus: countBy(contracts, "status") as ContractStats["byStatus"],
    byCommodity: countBy(contracts, "commodity") as ContractStats["byCommodity"],
  };
}
