import { importKeysFromCsv } from "../src/lib/keys";
import { sql } from "../src/lib/db";

const count = await importKeysFromCsv("keys.csv");
console.log(`Imported: ${count}`);

const rows = await sql`SELECT name, is_active, daily_limit FROM api_keys ORDER BY name`;
console.table(rows);
process.exit(0);
