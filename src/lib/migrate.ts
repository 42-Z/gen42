import { sql } from "bun";

const script = await Bun.file("migrations/custom-tables.sql").text();
await sql.unsafe(script);
// Run separately: ADD CHECK NOT VALID skips the scan under its DDL lock;
// validation scans under PostgreSQL's lighter SHARE UPDATE EXCLUSIVE lock.
await sql.unsafe(
	"ALTER TABLE generations VALIDATE CONSTRAINT generations_reasoning_check",
);
console.log("✅ Миграции применены");
process.exit(0);
