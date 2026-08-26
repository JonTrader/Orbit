import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { getDb, schema } from "@/lib/db/client";
import { resetPasswordFragmentUrl } from "@/lib/auth/paths";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email/templates/auth-emails";
import { requireEnv } from "@/lib/env";
import { getConfiguredOAuthProviderIds } from "@/lib/auth/oauth";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

// Better Auth degrades quietly when these are missing: an unset secret falls
// back to a published default outside production, and an unset base URL takes
// the origin from the request Host header - the same origin that ends up in
// verification and password-reset links.
const baseURL = requireEnv("BETTER_AUTH_URL", "http://localhost:3000");
const secret = requireEnv("BETTER_AUTH_SECRET");
const configuredOAuthProviders = getConfiguredOAuthProviderIds();
const trustedOrigins = [
  baseURL,
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
].filter((origin, index, origins) => origins.indexOf(origin) === index);
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const microsoftClientId = process.env.MICROSOFT_CLIENT_ID;
const microsoftClientSecret = process.env.MICROSOFT_CLIENT_SECRET;

export const auth = betterAuth({
  baseURL,
  secret,
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  rateLimit: {
    // Memory storage resets across Vercel instances. The table keeps the
    // sensitive endpoint limits shared across serverless invocations.
    storage: "database",
  },
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    // Spec §3: email/password users verify before they can use the app.
    requireEmailVerification: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    // A reset is how someone takes an account back, so it has to end whatever
    // sessions an attacker already holds.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user, resetPasswordFragmentUrl(url));
    },
  },
  databaseHooks: {
    account: {
      create: {
        after: async (data, context) => {
          // Better Auth marks OAuth users verified through the provider. Persist
          // that fact so app-gate requests do not need another account query.
          if (data.providerId === "credential" || !context) return;
          await context.context.internalAdapter.updateUser(data.userId, {
            emailVerified: true,
          });
        },
      },
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
    ...(configuredOAuthProviders.includes("google")
      ? {
          google: {
            clientId: googleClientId!,
            clientSecret: googleClientSecret!,
          },
        }
      : {}),
    ...(configuredOAuthProviders.includes("microsoft")
      ? {
          microsoft: {
            clientId: microsoftClientId!,
            clientSecret: microsoftClientSecret!,
            // Personal and work accounts both sign in; households are not a tenant.
            tenantId: "common",
            prompt: "select_account",
          },
        }
      : {}),
  },
  // Must stay last: it writes Set-Cookie for Server Actions.
  plugins: [nextCookies()],
});
