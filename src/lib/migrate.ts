import { sql } from "bun";
import { readFileSync } from "node:fs";

const script = readFileSync("migrations/custom-tables.sql", "utf8");
await sql.unsafe(script);
console.log("✅ Миграции применены");
process.exit(0);
