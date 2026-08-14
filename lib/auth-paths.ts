/**
 * Auth route constants. Kept apart from `lib/auth.ts` so client components can
 * import them without pulling the server auth instance into the browser bundle.
 */
export const APP_PATH = "/";
export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";
export const VERIFY_EMAIL_PATH = "/verify-email";
export const FORGOT_PASSWORD_PATH = "/forgot-password";
export const RESET_PASSWORD_PATH = "/reset-password";

export function verifyEmailPath(email?: string): string {
  return email
    ? `${VERIFY_EMAIL_PATH}?email=${encodeURIComponent(email)}`
    : VERIFY_EMAIL_PATH;
}
