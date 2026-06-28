import opportunitiesData from "@/data/opportunities.json";

export interface SamOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber: string;
  noticeType: string;
  naicsCode: string;
  pscCode: string;
  responseDeadline: string | null;
  postedDate: string;
  setAsideType: string | null;
  placeOfPerformance: {
    city: string | null;
    state: string | null;
    country: string | null;
  } | null;
  contractingOffice: string | null;
  department: string | null;
  pointOfContact: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  description: string | null;
  samUrl: string;
  archiveDate: string | null;
}

export interface OpportunityStats {
  total: number;
  byNoticeType: { noticeType: string; count: number }[];
  bySetAside: { setAsideType: string; count: number }[];
  byDepartment: { department: string; count: number }[];
  expiringWithin7Days: number;
}

export const opportunities = (opportunitiesData as { opportunities: SamOpportunity[] }).opportunities;
export const opportunitiesMeta = (opportunitiesData as { meta: { fetchedAt: string; totalCount: number } }).meta;

function countByField(items: SamOpportunity[], field: keyof SamOpportunity): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const v = item[field];
    if (typeof v === "string" && v.trim()) {
      counts.set(v, (counts.get(v) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));
}

export function getOpportunityStats(): OpportunityStats {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return {
    total: opportunities.length,
    byNoticeType: countByField(opportunities, "noticeType").map(({ value, count }) => ({
      noticeType: value,
      count,
    })),
    bySetAside: countByField(opportunities, "setAsideType").map(({ value, count }) => ({
      setAsideType: value,
      count,
    })),
    byDepartment: countByField(opportunities, "department").map(({ value, count }) => ({
      department: value,
      count,
    })),
    expiringWithin7Days: opportunities.filter((o) => {
      if (!o.responseDeadline) return false;
      const deadline = new Date(o.responseDeadline);
      return deadline >= now && deadline <= in7Days;
    }).length,
  };
}

export function daysUntilDeadline(deadline: string | null): number | null {
  if (!deadline) return null;
  const now = new Date();
  const d = new Date(deadline);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
