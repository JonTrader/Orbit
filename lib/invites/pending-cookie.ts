import { cookies } from "next/headers";

import { inviteBearer } from "@/lib/invites/link";

/** HttpOnly cookie that holds a pending Invite bearer after the email link lands. */
export const PENDING_INVITE_COOKIE = "orbit_invite";

const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

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

/** Reads the pending Invite bearer, or null when missing / malformed. */
export async function readPendingInviteToken(): Promise<string | null> {
  const store = await cookies();
  return inviteBearer(store.get(PENDING_INVITE_COOKIE)?.value);
}

/** Clears the pending Invite cookie after accept or abandon. */
export async function clearPendingInviteCookie(): Promise<void> {
  const store = await cookies();
  store.set(PENDING_INVITE_COOKIE, "", {
    ...pendingInviteCookieOptions(),
    maxAge: 0,
  });
}
