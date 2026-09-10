import { beforeEach, describe, expect, it, vi } from "vitest";

import { passwordResetEmail, verificationEmail } from "@/lib/email/templates/auth";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email/templates/auth-emails";
import {
  buildInviteAcceptUrl,
  inviteEmail,
} from "@/lib/email/templates/invite";
import { sendInviteEmail } from "@/lib/email/templates/invite-emails";
import { sendEmail } from "@/lib/email/mailer";

vi.mock("@/lib/email/mailer", () => ({ sendEmail: vi.fn() }));

process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

const VERIFY_URL = "https://orbit.test/api/auth/verify-email?token=abc123";
const RESET_URL = "https://orbit.test/reset-password?token=def456";
const ACCEPT_URL = "http://localhost:3000/accept-invite?token=secret-token";

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

describe("invite email templates", () => {
  it("builds the accept URL from BETTER_AUTH_URL only", () => {
    expect(buildInviteAcceptUrl("raw-secret")).toBe(
      "http://localhost:3000/accept-invite?token=raw-secret",
    );
  });

  it("includes Space name, role, expiry, and accept URL", () => {
    const expiresAt = new Date("2026-09-17T12:00:00.000Z");
    const email = inviteEmail({
      spaceName: "Home",
      role: "editor",
      acceptUrl: ACCEPT_URL,
      expiresAt,
    });

    expect(email.subject).toBe("Join Home on Orbit");
    expect(email.html).toContain(ACCEPT_URL);
    expect(email.text).toContain(ACCEPT_URL);
    expect(email.text).toContain("Home");
    expect(email.text).toContain("Editor");
    expect(email.text).toContain(expiresAt.toUTCString());
    expect(email.text).toContain("sign in or create an Orbit account");
  });

  it("escapes a Space name that looks like markup", () => {
    const email = inviteEmail({
      spaceName: '<img src=x onerror="alert(1)">',
      role: "read-only",
      acceptUrl: ACCEPT_URL,
      expiresAt: new Date("2026-09-17T12:00:00.000Z"),
    });

    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img");
    expect(email.html).toContain("Read-only");
  });
});

describe("invite email sender", () => {
  beforeEach(() => {
    vi.mocked(sendEmail).mockClear();
  });

  it("sends Invite mail with a stable idempotency key", async () => {
    await sendInviteEmail(
      "guest@orbit.test",
      {
        spaceName: "Home",
        role: "read-only",
        acceptUrl: ACCEPT_URL,
        expiresAt: new Date("2026-09-17T12:00:00.000Z"),
      },
      { idempotencyKey: "invite:test:digest" },
    );

    expect(sendEmail).toHaveBeenCalledWith(
      {
        to: "guest@orbit.test",
        subject: "Join Home on Orbit",
        html: expect.stringContaining(ACCEPT_URL),
        text: expect.stringContaining(ACCEPT_URL),
      },
      { idempotencyKey: "invite:test:digest" },
    );
  });
});
