import postgres from "postgres";

export const sql = postgres(process.env.DATABASE_URL!, { max: 10 });

/** Обычный запрос или открытая транзакция — форма вызова у них одна */
export type SqlExecutor = postgres.ISql;

export async function checkDb(): Promise<boolean> {
	const result = await sql`SELECT NOW() AS now`;
	return result.length > 0;
}
