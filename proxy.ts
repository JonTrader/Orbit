import { NextResponse, type NextRequest } from "next/server";

import { ACCEPT_INVITE_PATH } from "@/lib/auth/paths";
import {
  PENDING_INVITE_COOKIE,
  pendingInviteCookieOptions,
} from "@/lib/invites/pending-cookie";

/**
 * Stashes an Invite bearer from `/accept-invite?token=...` into an HttpOnly
 * cookie, then redirects to bare `/accept-invite`. Next.js forbids
 * `cookies().set` during RSC render, so this runs at the proxy boundary.
 */
export function proxy(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.pathname = ACCEPT_INVITE_PATH;
  destination.search = "";

  const response = NextResponse.redirect(destination);
  response.cookies.set(
    PENDING_INVITE_COOKIE,
    token,
    pendingInviteCookieOptions(),
  );
  return response;
}

export const config = {
  // Literal so Next can statically analyze it. Imported constants are ignored
  // and the proxy would run on every request.
  matcher: "/accept-invite",
};
