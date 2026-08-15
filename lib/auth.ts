import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { getDb, schema } from "@/lib/db/client";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email/auth-emails";
import { requireEnv } from "@/lib/env";

// Better Auth degrades quietly when these are missing: an unset secret falls
// back to a published default outside production, and an unset base URL takes
// the origin from the request Host header - the same origin that ends up in
// verification and password-reset links.
const baseURL = requireEnv("BETTER_AUTH_URL", "http://localhost:3000");
const secret = requireEnv("BETTER_AUTH_SECRET");

export const auth = betterAuth({
  baseURL,
  secret,
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    // Spec §3: email/password users verify before they can use the app.
    requireEmailVerification: true,
    // A reset is how someone takes an account back, so it has to end whatever
    // sessions an attacker already holds.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user, url);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // A blocked sign-in attempt gets a fresh link instead of a dead end.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user, url);
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID ?? "",
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      // Personal and work accounts both sign in; households are not a tenant.
      tenantId: "common",
      prompt: "select_account",
    },
  },
  // Must stay last: it writes Set-Cookie for Server Actions.
  plugins: [nextCookies()],
});
