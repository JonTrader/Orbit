import { ACCEPT_INVITE_PATH } from "@/lib/auth/paths";
import { requireEnv } from "@/lib/env";

import { renderEmail, type RenderedEmail } from "./layout";

export interface InviteEmailInput {
  spaceName: string;
  role: "editor" | "read-only";
  acceptUrl: string;
  expiresAt: Date;
}

/** Absolute accept URL from trusted BETTER_AUTH_URL only. */
export function buildInviteAcceptUrl(rawToken: string): string {
  const base = requireEnv("BETTER_AUTH_URL", "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const url = new URL(ACCEPT_INVITE_PATH, `${base}/`);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

function roleLabel(role: InviteEmailInput["role"]): string {
  return role === "editor" ? "Editor" : "Read-only";
}

/** Pure escaped Invite email via the shared layout renderer. */
export function inviteEmail(input: InviteEmailInput): RenderedEmail {
  const role = roleLabel(input.role);
  const expiry = input.expiresAt.toUTCString();

  return renderEmail(`Join ${input.spaceName} on Orbit`, {
    heading: `Join ${input.spaceName}`,
    paragraphs: [
      "Hi,",
      `You have been invited to the Space "${input.spaceName}" on Orbit as ${role}.`,
      "Open the link below to sign in or create an Orbit account, then accept the Invite.",
      `This Invite expires on ${expiry} (7 days from when it was sent).`,
    ],
    action: { label: "Accept Invite", url: input.acceptUrl },
    footer:
      "If you were not expecting this Invite, you can ignore this email.",
  });
}
