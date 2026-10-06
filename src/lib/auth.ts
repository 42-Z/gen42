import { betterAuth } from "better-auth";
import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";
import { DAILY_GRANT_CREDITS, grantSignupCredits } from "./credits";

const kysely = new Kysely({
	dialect: new PostgresJSDialect({
		postgres: postgres(process.env.DATABASE_URL!, { max: 10 }),
	}),
});

export const SIGNUP_BONUS_CREDITS = DAILY_GRANT_CREDITS;

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
						await grantSignupCredits(user.id);
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
