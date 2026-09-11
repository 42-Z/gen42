import { betterAuth } from "better-auth";
import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

const kysely = new Kysely({
  dialect: new PostgresJSDialect({
    postgres: postgres(process.env.DATABASE_URL!, { max: 10 }),
  }),
});

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
});

export type Session = typeof auth.$Infer.Session;
