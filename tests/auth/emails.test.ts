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
import {
  buildUpcomingUrl,
  reminderEmail,
} from "@/lib/email/templates/reminders";
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

const REMINDER_SPACE_ID = "11111111-1111-4111-8111-111111111111";
const UPCOMING_URL = `http://localhost:3000/spaces/${REMINDER_SPACE_ID}/upcoming`;

const reminderCandidate = {
  spaceId: REMINDER_SPACE_ID,
  spaceName: "Home",
  entityId: "00000000-0000-0000-0000-000000000010",
  recipientUserId: "user-1",
  recipientEmail: "owner@orbit.test",
  title: "Rent",
  dueOn: "2026-08-13",
};

describe("reminder email templates", () => {
  it("builds the Upcoming URL from BETTER_AUTH_URL only", () => {
    expect(buildUpcomingUrl(REMINDER_SPACE_ID)).toBe(UPCOMING_URL);
  });

  it("names the Space, title, due date, and days before for a Monthly", () => {
    const email = reminderEmail({
      ...reminderCandidate,
      kind: "monthly_due",
      period: "2026-08",
      daysBefore: 3,
    });

    expect(email.to).toBe("owner@orbit.test");
    expect(email.subject).toBe("Orbit Reminder: Rent is due 2026-08-13");
    expect(email.text).toContain("Home");
    expect(email.text).toContain("Rent");
    expect(email.text).toContain("2026-08-13");
    expect(email.text).toContain("This Reminder is 3 days before it is due.");
    expect(email.html).toContain(UPCOMING_URL);
    expect(email.text).toContain(UPCOMING_URL);
  });

  it("words a one-day lead and a Reminder that falls on the due date", () => {
    const oneDay = reminderEmail({
      ...reminderCandidate,
      kind: "monthly_due",
      period: "2026-08",
      daysBefore: 1,
    });
    const sameDay = reminderEmail({
      ...reminderCandidate,
      kind: "monthly_due",
      period: "2026-08",
      daysBefore: 0,
    });

    expect(oneDay.text).toContain("This Reminder is 1 day before it is due.");
    expect(oneDay.text).not.toContain("1 days");
    expect(sameDay.text).toContain("This Reminder is on the day it is due.");
  });

  it("distinguishes a Daily Task due today from one that is overdue", () => {
    const dueToday = reminderEmail({
      ...reminderCandidate,
      kind: "daily_nudge",
      title: "Trash",
      period: "2026-08-10",
      dueOn: "2026-08-10",
    });
    const overdue = reminderEmail({
      ...reminderCandidate,
      kind: "daily_nudge",
      title: "Trash",
      period: "2026-08-10",
      dueOn: "2026-08-09",
    });

    expect(dueToday.subject).toBe("Orbit Reminder: Trash is due today");
    expect(dueToday.text).toContain("Home");
    expect(dueToday.text).toContain("Trash");
    expect(dueToday.text).toContain("due today");
    expect(dueToday.text).toContain("2026-08-10");

    expect(overdue.subject).toBe("Orbit Reminder: Trash is overdue");
    expect(overdue.text).toContain("Home");
    expect(overdue.text).toContain("was due on 2026-08-09");
    expect(overdue.text).toContain("overdue");
  });

  it("escapes a title and Space name that look like markup", () => {
    const email = reminderEmail({
      ...reminderCandidate,
      kind: "daily_nudge",
      spaceName: "<Kitchen>",
      title: "<recycling>",
      period: "2026-08-10",
      dueOn: "2026-08-10",
    });

    expect(email.html).toContain("&lt;recycling&gt;");
    expect(email.html).not.toContain("<recycling>");
    expect(email.html).toContain("&lt;Kitchen&gt;");
    expect(email.html).not.toContain("<Kitchen>");
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
