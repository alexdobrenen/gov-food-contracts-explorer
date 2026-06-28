import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "..", "data", "contracts.db");
const outDir = path.join(__dirname, "..", "src", "data");
const outPath = path.join(outDir, "contracts.json");

if (!fs.existsSync(dbPath)) {
  console.error(`Contracts database not found at ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
const contracts = db
  .prepare("SELECT * FROM contracts ORDER BY contract_number ASC")
  .all();

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(contracts, null, 2)}\n`);

console.log(`Exported ${contracts.length} contracts to ${outPath}`);
