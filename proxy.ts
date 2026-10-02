import { NextResponse, type NextRequest } from "next/server";

import { ACCEPT_INVITE_PATH } from "@/lib/auth/paths";
import { inviteEmailArrival } from "@/lib/invites/link";
import {
  PENDING_INVITE_COOKIE,
  pendingInviteCookieOptions,
} from "@/lib/invites/pending-cookie";

/**
 * Stashes a legal Invite bearer from `/accept-invite?token=...` into an
 * HttpOnly cookie, then redirects to bare `/accept-invite`. An illegal bearer
 * is stripped from the URL and not stored. Next.js forbids `cookies().set`
 * during RSC render, so this runs at the proxy boundary.
 */
export function proxy(request: NextRequest) {
  const arrival = inviteEmailArrival(request.nextUrl.searchParams.get("token"));
  if (!arrival.strip) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.pathname = ACCEPT_INVITE_PATH;
  destination.search = "";

  const response = NextResponse.redirect(destination);
  if (arrival.bearer) {
    response.cookies.set(
      PENDING_INVITE_COOKIE,
      arrival.bearer,
      pendingInviteCookieOptions(),
    );
  }
  return response;
}

export const config = {
  // Literal so Next can statically analyze it. Imported constants are ignored
  // and the proxy would run on every request.
  matcher: "/accept-invite",
};
