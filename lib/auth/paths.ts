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
/** Invite email landing. */
export const ACCEPT_INVITE_PATH = "/accept-invite";
/** Query key for a validated local post-auth return path. */
export const CONTINUATION_PARAM = "continue";

const MAX_CONTINUATION_LENGTH = 512;
const MAX_INVITE_TOKEN_LENGTH = 256;

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

/** Invite accept path with the bearer token in the query string. */
export function acceptInvitePath(token: string): string {
  const params = new URLSearchParams({ token });
  return `${ACCEPT_INVITE_PATH}?${params.toString()}`;
}

/**
 * Narrowly validates a local Invite continuation. Only `/accept-invite` with a
 * non-empty token is allowed. Rejects absolute URLs, protocol-relative paths,
 * and malformed targets.
 */
export function parseLocalContinuation(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (raw.length > MAX_CONTINUATION_LENGTH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("://") || raw.includes("\\")) return null;
  if (/%2f%2f/i.test(raw)) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw, "http://orbit.local");
  } catch {
    return null;
  }

  if (parsed.username || parsed.password || parsed.host !== "orbit.local") {
    return null;
  }
  if (parsed.pathname !== ACCEPT_INVITE_PATH) return null;

  const token = parsed.searchParams.get("token");
  if (
    !token ||
    token.length === 0 ||
    token.length > MAX_INVITE_TOKEN_LENGTH
  ) {
    return null;
  }

  return acceptInvitePath(token);
}

/** Appends a validated continuation query when present. */
export function withContinuation(
  path: string,
  continuation: string | null | undefined,
): string {
  if (!continuation) return path;

  const hashIndex = path.indexOf("#");
  const withoutHash = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : path.slice(hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  const base = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const params = new URLSearchParams(
    queryIndex === -1 ? "" : withoutHash.slice(queryIndex + 1),
  );
  params.set(CONTINUATION_PARAM, continuation);
  return `${base}?${params.toString()}${hash}`;
}

/**
 * Post-auth callback through the app entry so Personal Space onboarding runs,
 * then optionally returns to a validated Invite URL.
 */
export function authCallbackUrl(
  continuation: string | null | undefined,
): string {
  return withContinuation(APP_PATH, continuation ?? null);
}

export function verifyEmailPath(
  email?: string,
  continuation?: string | null,
): string {
  const params = new URLSearchParams();
  if (email) params.set("email", email);
  if (continuation) params.set(CONTINUATION_PARAM, continuation);
  const query = params.toString();
  return query ? `${VERIFY_EMAIL_PATH}?${query}` : VERIFY_EMAIL_PATH;
}
