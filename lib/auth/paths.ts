/**
 * Auth route constants. Kept apart from `lib/auth.ts` so client components can
 * import them without pulling the server auth instance into the browser bundle.
 */
export const APP_PATH = "/";
export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";
export const VERIFY_EMAIL_PATH = "/verify-email";
export const FORGOT_PASSWORD_PATH = "/forgot-password";
/** Email-token landing after a forgot-password link. Usable while signed out. */
export const RESET_PASSWORD_PATH = "/reset-password";

/**
 * Better Auth gives the reset callback a URL with the token in its path. Move
 * that token into a fragment so the browser never sends it to the server.
 */
export function resetPasswordFragmentUrl(url: string): string {
  const generated = new URL(url);
  const pathToken = generated.pathname.match(/\/reset-password\/([^/]+)$/)?.[1];
  const token =
    generated.searchParams.get("token") ??
    (pathToken ? decodeURIComponent(pathToken) : undefined);

  if (!token) throw new Error("Reset URL does not contain a token");

  const destination = new URL(RESET_PASSWORD_PATH, generated.origin);
  destination.hash = new URLSearchParams({ token }).toString();
  return destination.toString();
}
/** Signed-in change-password page (requires a verified session). */
export const CHANGE_PASSWORD_PATH = "/change-password";

export function verifyEmailPath(email?: string): string {
  return email
    ? `${VERIFY_EMAIL_PATH}?email=${encodeURIComponent(email)}`
    : VERIFY_EMAIL_PATH;
}
