import { sql } from "bun";

export { sql };

export async function checkDb(): Promise<boolean> {
  const result = await sql`SELECT NOW() AS now`;
  return result.length > 0;
}
