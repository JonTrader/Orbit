/**
 * Invite link policy. One bearer rule for the email link, the HttpOnly
 * cookie, and auth continuation: the raw secret is at most 256 characters,
 * and it never stays in a URL after the first hit.
 */

/** Invite email landing. Auth continue uses this path with no query. */
export const ACCEPT_INVITE_PATH = "/accept-invite";

/** Raw Invite bearer length cap. Shared by the cookie, continuation, and accept schema. */
export const INVITE_BEARER_MAX_LENGTH = 256;

const MAX_CONTINUATION_LENGTH = 512;

/** A usable raw Invite bearer, or null when missing or malformed. */
export function inviteBearer(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.length > INVITE_BEARER_MAX_LENGTH) return null;
  return value;
}

/**
 * What to do with `/accept-invite?token=`. Absent token passes through.
 * Any present token leaves the URL. Only a legal bearer is stashed.
 */
export function inviteEmailArrival(token: string | null):
  | { strip: false }
  | { strip: true; bearer: string | null } {
  if (token === null) return { strip: false };
  return { strip: true, bearer: inviteBearer(token) };
}

/**
 * Narrowly validates a local Invite continuation. Only bare `/accept-invite`
 * is emitted. Legacy `?token=` continue values are accepted but canonicalized
 * to the bare path so the bearer is never re-emitted into auth URLs.
 * Rejects absolute URLs, protocol-relative paths, and malformed targets.
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
  if (token !== null && !inviteBearer(token)) return null;

  return ACCEPT_INVITE_PATH;
}
