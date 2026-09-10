import { sendEmail, type SendEmailOptions } from "../mailer";

import { inviteEmail, type InviteEmailInput } from "./invite";

/** Sends one Invite email with an optional stable Resend idempotency key. */
export async function sendInviteEmail(
  to: string,
  input: InviteEmailInput,
  options: SendEmailOptions = {},
): Promise<void> {
  await sendEmail(
    {
      to,
      ...inviteEmail(input),
    },
    options,
  );
}
