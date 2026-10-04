import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { settings } from "../db/schema.js";

export interface EmailSettings {
  /** Resend API key. Never sent to the browser. */
  apiKey: string;
  /** Sender, e.g. "Deckhand Games <crew@deckhand.games>". */
  from: string;
  /** The site's public address, used in links (never taken from a request's Host header). */
  siteUrl: string;
}

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Where replies go, if not the sender (e.g. the player who wrote to support). */
  replyTo?: string;
}

/** Sends one email with the given settings. Swapped for a fake in tests. */
export type Mailer = (config: EmailSettings, email: Email) => Promise<void>;

export const resendMailer: Mailer = async (config, email) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: config.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(`Resend refused the email: ${detail.message ?? res.status}`);
  }
};

export async function emailSettings(db: Db): Promise<EmailSettings | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "email"));
  const value = row?.value as Partial<EmailSettings> | undefined;
  return value?.apiKey && value.from && value.siteUrl ? (value as EmailSettings) : null;
}

export async function saveEmailSettings(db: Db, value: EmailSettings) {
  await db
    .insert(settings)
    .values({ key: "email", value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** A short, plain email with one button. */
export function simpleEmail(opts: {
  to: string;
  subject: string;
  lines: string[];
  button?: { label: string; url: string };
}): Email {
  const text = [...opts.lines, opts.button ? `${opts.button.label}: ${opts.button.url}` : ""]
    .filter(Boolean)
    .join("\n\n");
  const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:auto;padding:24px;background:#0b2a3a;color:#f3e5c0;border-radius:14px">
<h1 style="color:#f2b84b;font-size:24px;margin:0 0 12px">Deckhand Games</h1>
${opts.lines.map((l) => `<p style="font-size:16px;line-height:1.5">${escape(l)}</p>`).join("\n")}
${
  opts.button
    ? `<p><a href="${escape(opts.button.url)}" style="display:inline-block;background:#f2b84b;color:#04121c;padding:10px 18px;border-radius:10px;font-weight:bold;text-decoration:none">${escape(opts.button.label)}</a></p>`
    : ""
}
</div>`;
  return { to: opts.to, subject: opts.subject, text, html };
}
