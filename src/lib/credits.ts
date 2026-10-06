import { sql } from "./db";

export class InsufficientCreditsError extends Error {
	constructor() {
		super("Insufficient credits");
	}
}

/** Ежедневная выдача и стартовый баланс при регистрации (одно и то же число). */
export const DAILY_GRANT_CREDITS = 42;

export async function getCredits(userId: string): Promise<number> {
	const [row] = await sql`
    INSERT INTO credits (user_id, balance) VALUES (${userId}, 0)
    ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
    RETURNING balance
  `;
	return row!.balance;
}

export async function addCredits(
	userId: string,
	amount: number,
): Promise<number> {
	const [row] = await sql`
    INSERT INTO credits (user_id, balance) VALUES (${userId}, ${amount})
    ON CONFLICT (user_id)
    DO UPDATE SET balance = credits.balance + ${amount}, updated_at = NOW()
    RETURNING balance
  `;
	return row!.balance;
}

export async function deductCredits(
	userId: string,
	amount: number,
): Promise<number> {
	if (!Number.isInteger(amount) || amount < 1) {
		throw new Error(`Invalid credit amount: ${amount}`);
	}

	const rows = await sql`
    UPDATE credits
    SET balance = balance - ${amount}, updated_at = NOW()
    WHERE user_id = ${userId} AND balance >= ${amount}
    RETURNING balance
  `;

	if (rows.length === 0) {
		throw new InsufficientCreditsError();
	}
	return rows[0]!.balance;
}

export async function refundCredits(
	userId: string,
	amount: number,
): Promise<void> {
	if (!Number.isInteger(amount) || amount < 1) {
		throw new Error(`Invalid credit amount: ${amount}`);
	}
	await sql`
    UPDATE credits
    SET balance = balance + ${amount}, updated_at = NOW()
    WHERE user_id = ${userId}
  `;
}

/**
 * Ежедневная выдача: +${DAILY_GRANT_CREDITS} каждому пользователю, кто ещё не
 * получил их за текущий день (граница дня — полночь МСК). Идемпотентна:
 * повторный вызов за тот же день ничего не начисляет и не возвращает.
 */
export async function grantDailyCredits(): Promise<number> {
	const rows = await sql`
    INSERT INTO credits (user_id, balance, last_grant_date)
    SELECT u.id, ${DAILY_GRANT_CREDITS}, (now() AT TIME ZONE 'Europe/Moscow')::date
    FROM "user" u
    WHERE NOT EXISTS (
      SELECT 1 FROM credits c
      WHERE c.user_id = u.id
        AND c.last_grant_date = (now() AT TIME ZONE 'Europe/Moscow')::date
    )
    ON CONFLICT (user_id) DO UPDATE
      SET balance = credits.balance + ${DAILY_GRANT_CREDITS},
          last_grant_date = EXCLUDED.last_grant_date,
          updated_at = NOW()
      WHERE credits.last_grant_date IS DISTINCT FROM EXCLUDED.last_grant_date
    RETURNING user_id
  `;
	return rows.length;
}

/** Стартовый баланс новому пользователю — как дневная выдача, без ожидания крона. */
export async function grantSignupCredits(userId: string): Promise<void> {
	await sql`
    INSERT INTO credits (user_id, balance, last_grant_date)
    VALUES (${userId}, ${DAILY_GRANT_CREDITS}, (now() AT TIME ZONE 'Europe/Moscow')::date)
    ON CONFLICT (user_id) DO NOTHING
  `;
}
