import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { user as userTable } from "../db/schema";
import { newId } from "./id";
import { mailerConfigured, sendMail, signInCodeMail } from "./mailer";
import { runSignupTransaction } from "./signup";

// ZEQQAT_EDITION gate: this is the one module that answers "which providers
// render" and "where does the namespace come from" (spec section 2). Only
// 'cloud' is built in this slice.
const enabledProviders = (process.env.ENABLED_AUTH_PROVIDERS ?? "google").split(",").map((p) => p.trim());

// Email sign-in sends a one-time code, so it needs a mailer (lib/mailer.ts).
// Listed in ENABLED_AUTH_PROVIDERS without one, it stays off.
const emailEnabled = enabledProviders.includes("email") && mailerConfigured();

// Sign-in methods to render, in display order. Only providers that are both
// enabled and configured here. "email" renders as a code form under the
// buttons.
export const signInProviders = (["google", "github", "email"] as const).filter((p) =>
  p === "email" ? emailEnabled : enabledProviders.includes(p),
);

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
  // Email sign-in: a 6-digit code, good for 10 minutes and 5 tries. A code
  // proves the person owns the address, so the account is created with a
  // verified email (and an existing account with that email signs in).
  plugins: emailEnabled
    ? [
        emailOTP({
          otpLength: 6,
          expiresIn: 600,
          allowedAttempts: 5,
          storeOTP: "hashed",
          async sendVerificationOTP({ email, otp, type }) {
            if (type !== "sign-in") return;
            await sendMail(signInCodeMail(email, otp));
          },
        }),
      ]
    : [],
  // Each code request sends an email, so it gets a tighter limit than the
  // rest of the auth API.
  rateLimit: {
    customRules: {
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/sign-in/email-otp": { window: 60, max: 10 },
    },
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
