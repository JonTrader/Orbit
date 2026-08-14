import { Resend } from "resend";

import { isProductionRuntime, requireEnv } from "@/lib/env";

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Better Auth invokes the verification and reset callbacks through
// `runInBackgroundOrAwait`, which logs whatever they throw and answers the
// request anyway. A missing key would therefore surface as a signed-up user
// who never gets mail, so production refuses to boot without one instead.
if (isProductionRuntime()) {
  requireEnv("RESEND_API_KEY");
  requireEnv("EMAIL_FROM");
}

/** Resend reports these as `error` rather than throwing, and they pass. */
const TRANSIENT_ERRORS = new Set([
  "application_error",
  "concurrent_idempotent_requests",
  "internal_server_error",
  "rate_limit_exceeded",
]);

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [250, 1_000];

let cached: { apiKey: string; client: Resend } | undefined;

function getResend(apiKey: string): Resend {
  if (cached?.apiKey !== apiKey) cached = { apiKey, client: new Resend(apiKey) };
  return cached.client;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Single seam for every outbound Orbit email (verification, password reset,
 * later Invites and Reminders). Tests mock this module rather than Resend.
 *
 * Outside production a missing `RESEND_API_KEY` / `EMAIL_FROM` logs the message
 * instead of sending it, so local sign-up still works.
 */
export async function sendEmail(email: OutboundEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    const missing = [
      !apiKey && "RESEND_API_KEY",
      !from && "EMAIL_FROM",
    ].filter(Boolean);

    if (process.env.NODE_ENV === "production") {
      throw new Error(`Cannot send email: ${missing.join(" and ")} is not set`);
    }

    console.warn(
      `[email] ${missing.join(" and ")} not set - logging instead of sending\n` +
        `  to: ${email.to}\n  subject: ${email.subject}\n${email.text}`,
    );
    return;
  }

  // Stable across retries so a response we never saw cannot become a second
  // copy of the same verification link.
  const idempotencyKey = crypto.randomUUID();
  let lastMessage = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { error } = await getResend(apiKey).emails.send(
      {
        from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
      { idempotencyKey },
    );

    if (!error) return;

    lastMessage = error.message;
    const backoff = RETRY_BACKOFF_MS[attempt];
    if (!TRANSIENT_ERRORS.has(error.name) || backoff === undefined) break;
    await wait(backoff);
  }

  // The throw below is swallowed by whoever called us, so say it here while
  // the recipient and subject are still in hand.
  console.error(
    `[email] giving up on "${email.subject}" to ${email.to}: ${lastMessage}`,
  );
  throw new Error(`Resend rejected the email: ${lastMessage}`);
}
