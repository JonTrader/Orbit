import { beforeEach, describe, expect, it, vi } from "vitest";

import { passwordResetEmail, verificationEmail } from "@/emails/auth";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email/auth-emails";
import { sendEmail } from "@/lib/email/mailer";

vi.mock("@/lib/email/mailer", () => ({ sendEmail: vi.fn() }));

const VERIFY_URL = "https://orbit.test/api/auth/verify-email?token=abc123";
const RESET_URL = "https://orbit.test/reset-password?token=def456";

const recipient = { email: "member@orbit.test", name: "Jonathan Montoya" };

describe("auth email templates", () => {
  it("puts the verification link in both the html and text bodies", () => {
    const email = verificationEmail({ name: "Sam", url: VERIFY_URL });

    expect(email.subject).toBe("Verify your email for Orbit");
    expect(email.html).toContain(VERIFY_URL);
    expect(email.text).toContain(VERIFY_URL);
    expect(email.text).toContain("Hi Sam,");
  });

  it("says the reset link expires", () => {
    const email = passwordResetEmail({ name: null, url: RESET_URL });

    expect(email.subject).toBe("Reset your Orbit password");
    expect(email.html).toContain(RESET_URL);
    expect(email.text).toContain("expires in one hour");
  });

  it("keeps a percent-encoded callbackURL intact in the html link", () => {
    // Better Auth encodes callbackURL once; re-encoding it in the href turned
    // %2F into %252F and the verify route answered 403.
    const url =
      "http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=%2F";
    const email = verificationEmail({ name: "Sam", url });

    expect(email.html).toContain("callbackURL=%2F");
    expect(email.html).not.toContain("%252F");
    expect(email.text).toContain("callbackURL=%2F");
  });

  it("escapes a name that looks like markup", () => {
    const email = verificationEmail({
      name: "<script>alert(1)</script>",
      url: VERIFY_URL,
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

describe("auth email senders", () => {
  beforeEach(() => {
    vi.mocked(sendEmail).mockClear();
  });

  it("sends verification mail to the signing-up address", async () => {
    await sendVerificationEmail(recipient, VERIFY_URL);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith({
      to: recipient.email,
      subject: "Verify your email for Orbit",
      html: expect.stringContaining(VERIFY_URL),
      text: expect.stringContaining(VERIFY_URL),
    });
  });

  it("sends password reset mail with the reset link", async () => {
    await sendPasswordResetEmail(recipient, RESET_URL);

    expect(sendEmail).toHaveBeenCalledWith({
      to: recipient.email,
      subject: "Reset your Orbit password",
      html: expect.stringContaining(RESET_URL),
      text: expect.stringContaining(RESET_URL),
    });
  });
});
