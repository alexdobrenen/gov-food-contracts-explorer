"use client";

import { useState } from "react";
import { DLAContracts } from "@/components/DLAContracts";
import { FederalSpending } from "@/components/FederalSpending";

type Tab = "dla" | "federal";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("dla");

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
            Federal Food Services Contract Explorer
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--hunter-200)" }}>
            DLA Troop Support contracts & federal food/produce spending data
          </p>
        </div>
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab("dla")}
              className={`py-3 border-b-2 text-sm font-medium transition-colors ${
                activeTab === "dla"
                  ? "border-white text-white"
                  : "border-transparent text-white/60 hover:text-white/80"
              }`}
            >
              DLA Contracts
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
        {activeTab === "dla" ? <DLAContracts /> : <FederalSpending />}
      </main>
    </div>
  );
}
