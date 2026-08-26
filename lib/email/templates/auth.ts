import { renderEmail, type RenderedEmail } from "./layout";

export interface AuthEmailInput {
  name?: string | null;
  url: string;
}

function greeting(name?: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : "Hi,";
}

export function verificationEmail({ name, url }: AuthEmailInput): RenderedEmail {
  return renderEmail("Verify your email for Orbit", {
    heading: "Verify your email",
    paragraphs: [
      greeting(name),
      "Confirm this address to start using Orbit. Your Personal Space is ready once you do.",
    ],
    action: { label: "Verify email", url },
    footer: "If you did not sign up for Orbit, you can ignore this email.",
  });
}

export function passwordResetEmail({ name, url }: AuthEmailInput): RenderedEmail {
  return renderEmail("Reset your Orbit password", {
    heading: "Reset your password",
    paragraphs: [
      greeting(name),
      "Choose a new password to get back into Orbit. This link expires in one hour.",
    ],
    action: { label: "Set a new password", url },
    footer: "If you did not ask to reset your password, you can ignore this email.",
  });
}
