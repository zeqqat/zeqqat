import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { user as userTable } from "../db/schema";
import { emailEnabled, enabledProviders, passwordEnabled } from "./auth-providers";
import { edition } from "./edition";
import { newId } from "./id";
import { mailerConfigured, passwordResetMail, sendMail, signInCodeMail } from "./mailer";
import { passwordSignUpAllowed } from "./password-auth";
import { runSignupTransaction } from "./signup";

export { signInProviders } from "./auth-providers";

// zeqqat.com is open to anyone, so an account there must prove its email
// through a provider (a claimed address is how someone takes over another
// person's account). A self-hosted install is closed (first account, then
// invites), so it doesn't check.
const requireVerifiedEmail = edition() === "cloud";

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
  // Passwords (self-hosted only, lib/auth-providers.ts). Who may create a
  // password account is decided in the user.create hook below. Forgotten
  // passwords: an emailed link when a mailer is set, otherwise a link the
  // install's owner makes on the Team page (lib/actions/password.ts).
  emailAndPassword: {
    enabled: passwordEnabled,
    minPasswordLength: 10,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60 * 24,
    ...(passwordEnabled && mailerConfigured()
      ? {
          async sendResetPassword({ user, token }: { user: { email: string }; token: string }) {
            await sendMail(passwordResetMail(user.email, token));
          },
        }
      : {}),
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
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
    },
  },
  // OAuth failures land back on the page that started the sign-in (the
  // client passes errorCallbackURL); this is only the fallback.
  onAPIError: { errorURL: "/signin" },
  databaseHooks: {
    // zeqqat.com only: no verified email, no account. Every provider must
    // vouch for the email (Google always does; GitHub only for addresses the
    // person confirmed).
    session: {
      create: {
        before: async (session) => {
          if (!requireVerifiedEmail) return;
          const u = await db.query.user.findFirst({ where: eq(userTable.id, session.userId) });
          if (!u?.emailVerified) {
            throw new APIError("FORBIDDEN", { code: "email_not_verified", message: "Email not verified" });
          }
        },
      },
    },
    user: {
      create: {
        before: async (user, ctx) => {
          // A password account: the install's first account, or someone
          // with an open invite for exactly this email (the invite page
          // sends its token in a header).
          if (ctx?.path === "/sign-up/email") {
            const token = ctx.headers?.get("x-zeqqat-invite") ?? null;
            if (!passwordEnabled || !(await passwordSignUpAllowed(user.email, token))) {
              throw new APIError("FORBIDDEN", { code: "signups_closed", message: "Sign-ups are closed. Ask an owner for an invite." });
            }
            return;
          }
          if (requireVerifiedEmail && !user.emailVerified) {
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
