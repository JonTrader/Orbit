import { passwordResetEmail, verificationEmail } from "@/emails/auth";

import { sendEmail } from "./mailer";

export interface AuthEmailRecipient {
  email: string;
  name?: string | null;
}

export async function sendVerificationEmail(
  user: AuthEmailRecipient,
  url: string,
): Promise<void> {
  await sendEmail({
    to: user.email,
    ...verificationEmail({ name: user.name, url }),
  });
}

export async function sendPasswordResetEmail(
  user: AuthEmailRecipient,
  url: string,
): Promise<void> {
  await sendEmail({
    to: user.email,
    ...passwordResetEmail({ name: user.name, url }),
  });
}
