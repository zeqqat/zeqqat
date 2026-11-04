import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { user as userTable } from "../db/schema";
import { newId } from "./id";
import { runSignupTransaction } from "./signup";

// ZEQQAT_EDITION gate: this is the one module that answers "which providers
// render" and "where does the namespace come from" (spec section 2). Only
// 'cloud' is built in this slice.
const enabledProviders = (process.env.ENABLED_AUTH_PROVIDERS ?? "google").split(",").map((p) => p.trim());

// Sign-in buttons to render, in display order. Only providers that are both
// enabled and configured here; email sign-in isn't built yet.
export const signInProviders = (["google", "github"] as const).filter((p) => enabledProviders.includes(p));

export const auth = betterAuth({
  baseURL: process.env.ZEQQAT_PUBLIC_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: process.env.ZEQQAT_PUBLIC_URL ? [process.env.ZEQQAT_PUBLIC_URL] : [],
  database: drizzleAdapter(db, { provider: "pg" }),
  // Same email through Google or GitHub lands in the same account instead
  // of creating a second one. Only Google is trusted outright (every Google
  // account email is verified). GitHub links only when GitHub itself reports
  // the email as verified (Better Auth reads /user/emails for that), so an
  // unverified address added to someone's GitHub can't take over an account.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },
  // Every id column in this app is a native `uuid` (spec section 2: "UUID v7
  // generated in app code"). Better Auth's own default id format isn't a
  // UUID at all, which fails against these columns — override it.
  advanced: {
    database: {
      generateId: () => newId(),
    },
  },
  socialProviders: {
    ...(enabledProviders.includes("google")
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          },
        }
      : {}),
    ...(enabledProviders.includes("github")
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID ?? "",
            clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
          },
        }
      : {}),
  },
  // OAuth failures land back on the page that started the sign-in (the
  // client passes errorCallbackURL); this is only the fallback.
  onAPIError: { errorURL: "/signin" },
  databaseHooks: {
    // No verified email, no account. Every provider must vouch for the email
    // (Google always does; GitHub only for addresses the person confirmed).
    // An unverified address is how someone claims an email that isn't theirs.
    session: {
      create: {
        before: async (session) => {
          const u = await db.query.user.findFirst({ where: eq(userTable.id, session.userId) });
          if (!u?.emailVerified) {
            throw new APIError("FORBIDDEN", { code: "email_not_verified", message: "Email not verified" });
          }
        },
      },
    },
    user: {
      create: {
        before: async (user) => {
          if (!user.emailVerified) {
            throw new APIError("FORBIDDEN", { code: "email_not_verified", message: "Email not verified" });
          }
        },
        after: async (user) => {
          try {
            await runSignupTransaction(user.id, user.name, user.email);
          } catch (err) {
            // Compensate for Better Auth's already-committed user insert —
            // a user with no namespace is the worst first-run state there
            // is (spec section 5b).
            await db.delete(userTable).where(eq(userTable.id, user.id));
            throw err;
          }
        },
      },
    },
  },
});
