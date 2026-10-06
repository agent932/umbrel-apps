import { type RefObject, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api.js";
import { dialogProps, useDialog } from "./useDialog.js";

/** Same keys as the server's REPORT_REASONS. */
const REASONS = {
  name: "Offensive username",
  behaviour: "Rude or abusive behaviour",
  cheating: "Cheating or stalling",
  other: "Something else",
} as const;
type Reason = keyof typeof REASONS;

type View = "menu" | "report" | "reported" | "block" | "blocked";

/** Encodes a username for the /api/players/:username routes. */
const playerPath = (username: string) => `/api/players/${encodeURIComponent(username)}`;

/**
 * Report or block another player (App Store guideline 1.2). Opened from their name: the table
 * menu in an online game, the leaderboard, or the friends list.
 */
export function PlayerSheet({
  username,
  onClose,
  opener,
  onBlockedChange,
}: {
  username: string;
  onClose: () => void;
  opener?: RefObject<HTMLElement | null>;
  /** Told when they're blocked or unblocked, so a list can refresh. */
  onBlockedChange?: (blocked: boolean) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, { onClose, opener, dismissOutside: true });
  const [view, setView] = useState<View>("menu");
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void api<{ blocked: { username: string }[] }>("/api/blocks")
      .then((r) => live && setBlocked(r.blocked.some((b) => b.username === username)))
      .catch(() => live && setBlocked(false));
    return () => {
      live = false;
    };
  }, [username]);

  async function run(fn: () => Promise<unknown>, next: View) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setView(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server");
    } finally {
      setBusy(false);
    }
  }

  const report = () =>
    run(
      () =>
        api(`${playerPath(username)}/report`, {
          body: { reason, note: note.trim() || undefined },
        }),
      "reported",
    );
  const block = () =>
    run(async () => {
      await api(`${playerPath(username)}/block`, { method: "POST" });
      setBlocked(true);
      onBlockedChange?.(true);
    }, "blocked");
  const unblock = () =>
    run(async () => {
      await api(`${playerPath(username)}/block`, { method: "DELETE" });
      setBlocked(false);
      onBlockedChange?.(false);
    }, "menu");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
      <div
        ref={panel}
        {...dialogProps(`Report or block ${username}`)}
        className="panel flex w-full max-w-sm flex-col gap-3 p-5 text-sm text-parchment"
      >
        <h2 className="font-pirate text-2xl text-gold">{username}</h2>

        {view === "menu" && (
          <>
            <p className="text-parchment/80">
              Something wrong with this player? Tell us, or block them so you never meet again.
            </p>
            <button type="button" className="btn-secondary" onClick={() => setView("report")}>
              Report {username}…
            </button>
            {blocked ? (
              <button type="button" className="btn-secondary" disabled={busy} onClick={unblock}>
                Unblock {username}
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                disabled={blocked === null}
                onClick={() => setView("block")}
              >
                Block {username}…
              </button>
            )}
          </>
        )}

        {view === "report" && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void report();
            }}
          >
            <fieldset className="flex flex-col">
              <legend className="mb-1 text-parchment/80">What's the problem?</legend>
              {(Object.keys(REASONS) as Reason[]).map((r) => (
                <label key={r} className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                  />
                  {REASONS[r]}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1">
              Anything else we should know? (optional)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={3}
                className="rounded-lg border border-parchment/30 bg-sea-deep px-3 py-2 outline-none focus:border-gold"
              />
            </label>
            <button type="submit" className="btn-primary" disabled={!reason || busy}>
              Send report
            </button>
            <button type="button" className="btn-secondary" onClick={() => setView("menu")}>
              Back
            </button>
          </form>
        )}

        {view === "reported" && (
          <>
            <p role="status">
              Thanks for telling us. We look at every report within a day and remove players who
              break the rules.
            </p>
            {!blocked && (
              <button type="button" className="btn-secondary" onClick={() => setView("block")}>
                Block {username} too…
              </button>
            )}
          </>
        )}

        {view === "block" && (
          <>
            <p className="text-parchment/80">
              You won't be matched with {username} again, they can't challenge you or send you a
              friend request, and you won't see their call-outs. They aren't told.
            </p>
            <button
              type="button"
              className="rounded-xl bg-red-800 px-5 py-2 font-bold text-parchment hover:bg-red-700 disabled:opacity-50"
              disabled={busy}
              onClick={block}
            >
              Block {username}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setView("menu")}>
              Back
            </button>
          </>
        )}

        {view === "blocked" && (
          <p role="status">
            You've blocked {username}. You can unblock them any time on your Account page.
          </p>
        )}

        {error && (
          <p role="alert" className="text-red-300">
            {error}
          </p>
        )}
        <button
          type="button"
          className="min-h-11 text-parchment/80 hover:text-gold"
          onClick={onClose}
        >
          {view === "reported" || view === "blocked" ? "Done" : "Close"}
        </button>
      </div>
    </div>
  );
}
