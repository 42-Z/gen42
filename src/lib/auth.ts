import { betterAuth } from "better-auth";
import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";
import { sql } from "./db";

const kysely = new Kysely({
	dialect: new PostgresJSDialect({
		postgres: postgres(process.env.DATABASE_URL!, { max: 10 }),
	}),
});

export const SIGNUP_BONUS_CREDITS = 1;

export const auth = betterAuth({
	database: {
		db: kysely,
		type: "postgres",
		transaction: true,
	},
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,
		maxPasswordLength: 128,
		autoSignIn: true,
	},
	session: {
		expiresIn: 7 * 24 * 60 * 60,
		updateAge: 24 * 60 * 60,
	},
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					try {
						await sql`
              INSERT INTO credits (user_id, balance)
              VALUES (${user.id}, ${SIGNUP_BONUS_CREDITS})
              ON CONFLICT (user_id) DO NOTHING
            `;
					} catch (error) {
						console.error(
							`Не удалось выдать стартовые кредиты пользователю ${user.id}:`,
							error,
						);
					}
				},
			},
		},
	},
});

export type Session = typeof auth.$Infer.Session;
