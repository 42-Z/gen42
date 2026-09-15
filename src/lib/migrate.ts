import { readFileSync } from "node:fs";
import { sql } from "bun";

const script = readFileSync("migrations/custom-tables.sql", "utf8");
await sql.unsafe(script);
console.log("✅ Миграции применены");
process.exit(0);
