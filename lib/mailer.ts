import { siteHost } from "./edition";

// Outgoing email. Zeqqat sends one kind today: the sign-in code. Two ways to
// send, whichever is set: Resend's HTTP API (RESEND_API_KEY) or any SMTP
// server (SMTP_URL, e.g. smtps://user:pass@smtp.example.com:465). MAIL_FROM
// is the sender either way. With neither, email sign-in is simply not
// offered, so a self-hosted install without mail still works.

type Mail = { to: string; subject: string; text: string; html: string };

export function mailerConfigured(): boolean {
  return Boolean(process.env.MAIL_FROM && (process.env.RESEND_API_KEY || process.env.SMTP_URL));
}

export async function sendMail(mail: Mail): Promise<void> {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error("MAIL_FROM is not set");

  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend refused the email (${res.status})`);
    return;
  }

  if (process.env.SMTP_URL) {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(process.env.SMTP_URL);
    await transport.sendMail({ from, ...mail });
    return;
  }

  throw new Error("No mailer configured (set RESEND_API_KEY or SMTP_URL)");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// The forgotten-password email. The link opens /reset-password, good for 24
// hours and one use.
export function passwordResetMail(to: string, token: string): Mail {
  const host = siteHost();
  const url = `https://${host}/reset-password?token=${encodeURIComponent(token)}`;
  const text = [
    `Reset your ${host} password: ${url}`,
    "",
    "The link works once, for 24 hours. If you didn't ask for it, ignore this email: your password stays the same.",
  ].join("\n");
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0d141a;max-width:420px">
<p>Someone asked to reset the password for your ${escapeHtml(host)} account.</p>
<p><a href="${escapeHtml(url)}" style="color:#0d141a;font-weight:600">Choose a new password</a></p>
<p style="color:#5a6b78;font-size:13px">The link works once, for 24 hours. If you didn't ask for it, ignore this email: your password stays the same.</p>
</div>`;
  return { to, subject: `Reset your Zeqqat password`, text, html };
}

// The sign-in code email. The code is in the subject too, so it can be read
// from a notification without opening the email.
export function signInCodeMail(to: string, code: string): Mail {
  const host = siteHost();
  const text = [
    `Your ${host} sign-in code is ${code}`,
    "",
    "It works for 10 minutes. If you didn't try to sign in, ignore this email: nobody can get in without the code.",
  ].join("\n");
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0d141a;max-width:420px">
<p>Your ${escapeHtml(host)} sign-in code is</p>
<p style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:0.18em;margin:8px 0 16px">${escapeHtml(code)}</p>
<p style="color:#5a6b78;font-size:13px">It works for 10 minutes. If you didn't try to sign in, ignore this email: nobody can get in without the code.</p>
</div>`;
  return { to, subject: `${code} is your Zeqqat sign-in code`, text, html };
}
