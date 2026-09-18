import { cookies } from "next/headers";

/** HttpOnly cookie that holds a pending Invite bearer after the email link lands. */
export const PENDING_INVITE_COOKIE = "orbit_invite";

const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const MAX_TOKEN_LENGTH = 256;

export function pendingInviteCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

/** Writes the Invite bearer (Server Action / mutable cookie context only). */
export async function setPendingInviteCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(PENDING_INVITE_COOKIE, token, pendingInviteCookieOptions());
}

/** Reads the pending Invite bearer, or null when missing / malformed. */
export async function readPendingInviteToken(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(PENDING_INVITE_COOKIE)?.value;
  if (!value || value.length === 0 || value.length > MAX_TOKEN_LENGTH) {
    return null;
  }
  return value;
}

/** Clears the pending Invite cookie after accept or abandon. */
export async function clearPendingInviteCookie(): Promise<void> {
  const store = await cookies();
  store.set(PENDING_INVITE_COOKIE, "", {
    ...pendingInviteCookieOptions(),
    maxAge: 0,
  });
}
