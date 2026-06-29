import type { SamOpportunity } from "@/lib/opportunities";

export const distributorProfile = {
  name: "Food Distribution Partner",
  summary:
    "Large-scale fresh produce and food-box delivery operator with an established food distribution network.",
  capabilities: [
    "Fresh produce sourcing and distribution",
    "High-volume food-box assembly and delivery",
    "Multi-product food distribution",
    "Regional logistics and fulfillment",
  ],
  priorityPscCodes: ["8915", "8970"],
  adjacentPscCodes: ["8910", "8940", "8905", "8920"],
};

export type FitLevel = "strong" | "possible" | "low";

export interface OpportunityFit {
  score: number;
  level: FitLevel;
  reasons: string[];
}

const PSC_SCORES: Record<string, { score: number; reason: string }> = {
  "8915": { score: 50, reason: "Fresh produce product category" },
  "8970": { score: 45, reason: "Food-box or composite food package category" },
  "8910": { score: 25, reason: "Adjacent dairy distribution category" },
  "8940": { score: 25, reason: "Adjacent specialty food category" },
  "8905": { score: 20, reason: "Adjacent meat, poultry, and fish category" },
  "8920": { score: 20, reason: "Adjacent bakery and cereal category" },
};

function containsAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

export function scoreOpportunityFit(opportunity: SamOpportunity): OpportunityFit {
  const text = [
    opportunity.title,
    opportunity.description,
    opportunity.solicitationNumber,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;
  const reasons: string[] = [];
  const pscMatch = PSC_SCORES[opportunity.pscCode];

  if (pscMatch) {
    score += pscMatch.score;
    reasons.push(pscMatch.reason);
  }

  if (containsAny(text, ["fresh fruit", "fresh vegetable", "fresh produce", "produce box"])) {
    score += 30;
    reasons.push("Explicit fresh produce requirement");
  }

  if (containsAny(text, ["food box", "food package", "care package", "meal kit", "ration", "emergency food"])) {
    score += 25;
    reasons.push("Food-box, ration, or packaged-meal requirement");
  }

  if (containsAny(text, ["distribution", "delivery", "delivered", "prime vendor", "supply", "support"])) {
    score += 15;
    reasons.push("Distribution or delivery scope");
  }

  if (["424410", "424480", "424490"].includes(opportunity.naicsCode)) {
    score += 20;
    reasons.push("Food wholesale NAICS alignment");
  }

  if (opportunity.naicsCode.startsWith("311") && containsAny(text, ["manufactur", "processing", "production"])) {
    score -= 15;
    reasons.push("May require manufacturing rather than distribution");
  }

  const normalizedScore = Math.max(0, Math.min(100, score));
  const level: FitLevel =
    normalizedScore >= 65 ? "strong" : normalizedScore >= 40 ? "possible" : "low";

  return {
    score: normalizedScore,
    level,
    reasons: reasons.length > 0 ? reasons : ["No direct capability match identified"],
  };
}
