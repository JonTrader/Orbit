/** Orbit v2 tokens, inlined because email clients ignore stylesheets. */
const INK = "#1c1917";
const MUTED = "#78716c";
const LINE = "#e7e0d4";
const PANEL = "#fffdf9";
const BG = "#f6f1e8";
const ACCENT = "#c2410c";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailBody {
  heading: string;
  paragraphs: string[];
  action: { label: string; url: string };
  footer: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderEmail(
  subject: string,
  body: EmailBody,
): RenderedEmail {
  const paragraphs = body.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:${INK}">${escapeHtml(p)}</p>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:${BG};font-family:'Instrument Sans',-apple-system,'Segoe UI',sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto">
      <tr>
        <td style="padding:0 4px 14px;font-size:18px;font-weight:700;letter-spacing:-0.03em;color:${INK}">
          Or<span style="color:${ACCENT}">bit</span>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;background:${PANEL};border:1px solid ${LINE};border-radius:6px">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${INK}">${escapeHtml(body.heading)}</h1>
          ${paragraphs}
          <p style="margin:20px 0 4px">
            <!-- The URL arrives percent-encoded, so the href only needs HTML escaping; re-encoding it breaks Better Auth's callbackURL check. -->
            <a href="${escapeHtml(body.action.url)}" style="display:inline-block;padding:10px 18px;background:${INK};color:${PANEL};border-radius:4px;font-size:14px;font-weight:600;text-decoration:none">${escapeHtml(body.action.label)}</a>
          </p>
          <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:${MUTED}">${escapeHtml(body.footer)}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    body.heading,
    "",
    ...body.paragraphs,
    "",
    `${body.action.label}: ${body.action.url}`,
    "",
    body.footer,
  ].join("\n");

  return { subject, html, text };
}
