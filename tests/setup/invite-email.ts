import type { Mock } from "vitest";

import type { sendEmail } from "@/lib/email/mailer";

type SendEmailMock = Mock<typeof sendEmail>;

/** Reads the raw Invite bearer from the last mocked Invite email. */
export function lastEmailedInviteToken(send: SendEmailMock): string {
  const last = send.mock.calls.at(-1)?.[0];
  const body = last?.text ?? last?.html;
  if (!body) {
    throw new Error("Expected an Invite email to have been sent");
  }

  const urlMatch =
    body.match(/Accept Invite: (\S+)/) ??
    body.match(/href="([^"]*accept-invite[^"]*)"/);
  if (!urlMatch?.[1]) {
    throw new Error("Invite email did not contain an accept URL");
  }

  const token = new URL(urlMatch[1].replace(/&amp;/g, "&")).searchParams.get(
    "token",
  );
  if (!token) {
    throw new Error("Accept URL did not contain a token");
  }
  return token;
}
