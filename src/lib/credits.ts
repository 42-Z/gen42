import { sql } from "./db";

export class InsufficientCreditsError extends Error {
	constructor() {
		super("Insufficient credits");
	}
}

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

export async function deductCredit(userId: string): Promise<number> {
	const rows = await sql`
    UPDATE credits
    SET balance = balance - 1, updated_at = NOW()
    WHERE user_id = ${userId} AND balance >= 1
    RETURNING balance
  `;

	if (rows.length === 0) {
		throw new InsufficientCreditsError();
	}
	return rows[0]!.balance;
}

export async function refundCredit(userId: string): Promise<void> {
	await sql`
    UPDATE credits
    SET balance = balance + 1, updated_at = NOW()
    WHERE user_id = ${userId}
  `;
}
