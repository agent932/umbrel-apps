import { useEffect, useState } from "react";
import { api } from "../api.js";

interface Settings {
  configured: boolean;
  keyHint: string | null;
  from: string;
  siteUrl: string;
}

/** Admin: the Resend key and sender used for password resets and invites. */
export function EmailSettingsPanel() {
  const [s, setS] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [from, setFrom] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Settings>("/api/admin/email").then((r) => {
      setS(r);
      setFrom(r.from || "Deckhand Games <crew@deckhand.games>");
      setSiteUrl(r.siteUrl);
    });
  }, []);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setNote(null);
    try {
      setNote({ ok: true, text: await action() });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-parchment/30 bg-sea-deep px-3 py-2 outline-none focus:border-gold";
  if (!s) return null;
  return (
    <section className="panel flex flex-col gap-3 p-4" aria-labelledby="email-heading">
      <h2 id="email-heading" className="scroll-title !text-xl">
        Email
      </h2>
      <p className="text-sm text-parchment/80">
        Used for "forgot password" links and emailed game invites, sent through Resend.{" "}
        {s.configured ? `A key ending in …${s.keyHint} is saved.` : "Not set up yet."}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Resend API key {s.configured && "(leave empty to keep the saved one)"}
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={s.configured ? `…${s.keyHint}` : "re_…"}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Send from (an address on a domain you've verified in Resend)
        <input value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Site address (used in links)
        <input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} className={field} />
      </label>
      {note && (
        <p role={note.ok ? "status" : "alert"} className={note.ok ? "text-gold" : "text-red-300"}>
          {note.text}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary flex-1"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await api<{ keyHint: string }>("/api/admin/email", {
                method: "PUT",
                body: { ...(apiKey ? { apiKey } : {}), from, siteUrl },
              });
              setApiKey("");
              setS((old) => old && { ...old, configured: true, keyHint: r.keyHint });
              return "Saved.";
            })
          }
        >
          Save
        </button>
        <button
          type="button"
          className="btn-secondary flex-1"
          disabled={busy || !s.configured}
          onClick={() =>
            run(async () => {
              const r = await api<{ to: string }>("/api/admin/email/test", { body: {} });
              return `Test email sent to ${r.to}.`;
            })
          }
        >
          Send test email
        </button>
      </div>
    </section>
  );
}
