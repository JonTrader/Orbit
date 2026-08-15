import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const MESSAGE = {
  to: "sam@orbit.test",
  subject: "Verify your email for Orbit",
  html: "<p>Verify</p>",
  text: "Verify: https://orbit.test/verify",
};

/** Fresh module each time: the credentials are read as it loads. */
async function loadMailer() {
  vi.resetModules();
  return import("@/lib/email/mailer");
}

function idempotencyKeyOf(call: number): string {
  return send.mock.calls[call][1].idempotencyKey;
}

describe("outbound mail", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ data: { id: "sent" }, error: null });
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "Orbit <hello@orbit.test>");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends the message through Resend with the configured sender", async () => {
    const { sendEmail } = await loadMailer();

    await sendEmail(MESSAGE);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual({
      from: "Orbit <hello@orbit.test>",
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      html: MESSAGE.html,
      text: MESSAGE.text,
    });
  });

  it("logs delivery metadata without the email body", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendEmail } = await loadMailer();

    await sendEmail({
      ...MESSAGE,
      text: "Reset here: https://orbit.test/reset-password#token=secret-token",
    });

    const output = warn.mock.calls[0][0];
    expect(send).not.toHaveBeenCalled();
    expect(output).toContain("RESEND_API_KEY");
    expect(output).toContain(MESSAGE.to);
    expect(output).toContain(MESSAGE.subject);
    expect(output).toContain("email not sent");
    expect(output).not.toContain("Reset here");
    expect(output).not.toContain("secret-token");
  });

  it("refuses to boot in production without credentials", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_FROM", "");

    // Better Auth swallows what the send callback throws, so a deploy that
    // cannot send mail has to fail here rather than at the first sign-up.
    await expect(loadMailer()).rejects.toThrow("EMAIL_FROM is not set");
  });

  it("retries a transient rejection under one idempotency key", async () => {
    send
      .mockResolvedValueOnce({
        data: null,
        error: { name: "rate_limit_exceeded", message: "Too many requests" },
      })
      .mockResolvedValueOnce({ data: { id: "sent" }, error: null });
    const { sendEmail } = await loadMailer();

    await sendEmail(MESSAGE);

    expect(send).toHaveBeenCalledTimes(2);
    // A retry Resend already accepted must not become a second live link.
    expect(idempotencyKeyOf(0)).toBe(idempotencyKeyOf(1));
  });

  it("gives up immediately when Resend rejects the message itself", async () => {
    send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid `to` field" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendEmail } = await loadMailer();

    await expect(sendEmail(MESSAGE)).rejects.toThrow("Invalid `to` field");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("reports the failure itself, since the caller discards the throw", async () => {
    send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid `to` field" },
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendEmail } = await loadMailer();

    await expect(sendEmail(MESSAGE)).rejects.toThrow();
    expect(error.mock.calls[0][0]).toContain(MESSAGE.to);
    expect(error.mock.calls[0][0]).toContain(MESSAGE.subject);
  });
});
