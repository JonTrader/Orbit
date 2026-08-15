/**
 * The creator's IANA zone, parked in a cookie by the auth pages so the first
 * authenticated request can stamp it on their Personal Space (ADR 0003).
 */
export const TIMEZONE_COOKIE = "orbit_tz";

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Returns the zone only when it is a usable IANA name. */
export function normalizeTimeZone(
  value: string | undefined | null,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return isValidTimeZone(trimmed) ? trimmed : undefined;
}
