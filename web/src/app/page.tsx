"use client";

import { useState } from "react";
import { FederalSpending } from "@/components/FederalSpending";
import { OpenOpportunities } from "@/components/OpenOpportunities";

type Tab = "opportunities" | "federal";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("opportunities");

  return (
    <div className="min-h-screen" style={{ background: "var(--cream-100)" }}>
      <header
        className="border-b"
        style={{
          background: "var(--hunter-700)",
          borderColor: "var(--hunter-800)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-white">
            Gov Food Contract Explorer
          </h1>
        </div>
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab("opportunities")}
              className={`py-3 border-b-2 text-sm font-medium transition-colors ${
                activeTab === "opportunities"
                  ? "border-white text-white"
                  : "border-transparent text-white/60 hover:text-white/80"
              }`}
            >
              Open Opportunities
            </button>
            <button
              onClick={() => setActiveTab("federal")}
              className={`py-3 border-b-2 text-sm font-medium transition-colors ${
                activeTab === "federal"
                  ? "border-white text-white"
                  : "border-transparent text-white/60 hover:text-white/80"
              }`}
            >
              Federal Food Spending
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "opportunities" ? (
          <OpenOpportunities />
        ) : (
          <FederalSpending />
        )}
      </main>
    </div>
  );
}
