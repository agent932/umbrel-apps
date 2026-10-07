import { useCallback, useEffect, useRef, useState } from "react";
import { ADMIN_MAX_DELTA, type LedgerReason } from "@pirate/engine";
import { ApiError, api } from "../api.js";
import { lineLabel, newRequestId } from "../economy.js";
import { DoubloonIcon } from "./Doubloons.js";
import { dialogProps, useDialog } from "./useDialog.js";

/** One change to a player's doubloons, as the admin ledger route sends it. */
export interface LedgerRow {
  id: string;
  delta: number;
  reason: LedgerReason;
  /** What paid it: a match id, a day, an achievement key, or the adjustment's request id. */
  ref: string;
  /** Adjustments: why. */
  note: string | null;
  /** Adjustments: the admin who made it (null once their account is gone). */
  actor: string | null;
  createdAt: string;
}

/** How many changes the sheet lists (the server sends up to 100). */
const SHOWN = 50;

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });

/** "+500" or "−200" (a real minus sign). */
const signed = (n: number) => `${n > 0 ? "+" : "−"}${Math.abs(n).toLocaleString()}`;

/** What a ledger row was for, with the details an admin needs to check it. */
function rowText(row: LedgerRow) {
  const label = lineLabel({
    reason: row.reason,
    key: row.reason === "achievement" ? row.ref : undefined,
  });
  const details =
    row.reason === "admin"
      ? [`by ${row.actor ?? "a deleted account"}`, row.note]
      : row.reason === "daily"
        ? [`puzzle of ${row.ref}`]
        : [];
  return { label, details: [when(row.createdAt), ...details].filter(Boolean).join(" · ") };
}

/**
 * Admin: one player's doubloons. Add or remove some (with a reason, kept in their ledger), and
 * see their last 50 changes. Every adjustment carries a request id; trying the same adjustment
 * again after a failure reuses it, so a retry never pays twice.
 */
export function DoubloonsSheet({
  player,
  onClose,
  onChanged,
}: {
  player: { id: string; username: string; doubloons: number };
  onClose: () => void;
  /** Told the new balance after an adjustment. */
  onChanged: (doubloons: number) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, { onClose });
  const [balance, setBalance] = useState(player.doubloons);
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  /** The adjustment last tried and its request id, until it goes through. */
  const attempt = useRef<{ key: string; requestId: string } | null>(null);

  const load = useCallback(
    () =>
      api<{ rows: LedgerRow[] }>(`/api/admin/users/${player.id}/ledger`).then(
        (r) => {
          setRows(r.rows.slice(0, SHOWN));
          setLoadFailed(false);
        },
        () => setLoadFailed(true),
      ),
    [player.id],
  );
  useEffect(() => void load(), [load]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const n = Number(amount.trim());
    if (!/^\d+$/.test(amount.trim()) || n < 1 || n > ADMIN_MAX_DELTA) {
      setMessage({
        ok: false,
        text: `Enter a whole number from 1 to ${ADMIN_MAX_DELTA.toLocaleString()}`,
      });
      return;
    }
    const why = note.trim();
    if (!why) {
      setMessage({ ok: false, text: "Say why (only admins see it)" });
      return;
    }
    const delta = direction === "add" ? n : -n;
    // A different adjustment gets a new id; the same one tried again keeps its id.
    const key = `${delta}:${why}`;
    if (attempt.current?.key !== key) attempt.current = { key, requestId: newRequestId() };
    const { requestId } = attempt.current;
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{ doubloons: number }>(`/api/admin/users/${player.id}/doubloons`, {
        body: { delta, note: why, requestId },
      });
      attempt.current = null;
      setBalance(res.doubloons);
      setAmount("");
      setNote("");
      setMessage({
        ok: true,
        text: `Done: ${signed(delta)} for ${player.username} (balance now ${res.doubloons.toLocaleString()})`,
      });
      onChanged(res.doubloons);
      void load();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof ApiError ? err.message : "Couldn't reach the server. Try again.",
      });
      // It may have gone through before the connection dropped: the history will say.
      if (!(err instanceof ApiError)) void load();
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-parchment/30 bg-sea-deep px-3 py-2 outline-none focus:border-gold";
  return (
    <div className="dialog-shade z-50 bg-black/55">
      <div
        ref={panel}
        {...dialogProps(`${player.username}'s doubloons`)}
        className="panel flex w-full max-w-md flex-col gap-3 p-5 text-sm text-parchment"
      >
        <h2 className="font-pirate text-2xl text-gold">{player.username}</h2>
        <p className="flex items-center gap-2">
          <DoubloonIcon className="h-6 w-6" />
          <span className="num text-2xl text-gold">{balance.toLocaleString()}</span> doubloons
        </p>

        <form className="flex flex-col gap-2" onSubmit={(e) => void onSubmit(e)} noValidate>
          <fieldset className="flex gap-5">
            <legend className="sr-only">Add or remove</legend>
            {(["add", "remove"] as const).map((d) => (
              <label key={d} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="direction"
                  className="accent-gold"
                  value={d}
                  checked={direction === d}
                  onChange={() => setDirection(d)}
                />
                {d === "add" ? "Add" : "Remove"}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1">
            How many doubloons
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1">
            Why? (kept in their history, seen only by admins)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              autoComplete="off"
              className={field}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={busy}>
            {direction === "add" ? "Add doubloons" : "Remove doubloons"}
          </button>
        </form>
        {message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={message.ok ? "rounded-lg border border-gold/40 p-2" : "text-red-300"}
          >
            {message.text}
          </p>
        )}

        <h3 className="font-pirate text-xl text-gold">Last {SHOWN} changes</h3>
        {rows === null ? (
          loadFailed ? (
            <p role="alert" className="flex items-center gap-2 text-red-300">
              Couldn't load their history.
              <button type="button" className="text-gold underline" onClick={() => void load()}>
                Try again
              </button>
            </p>
          ) : (
            <p className="text-parchment/60">Loading…</p>
          )
        ) : rows.length === 0 ? (
          <p className="text-parchment/60">No doubloons yet.</p>
        ) : (
          <ul aria-label="Doubloon history">
            {rows.map((row) => {
              const { label, details } = rowText(row);
              return (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-3 border-t border-parchment/10 py-1.5"
                >
                  <span className="min-w-0">
                    <span className="block">{label}</span>
                    <span className="block text-xs break-words text-parchment/60">{details}</span>
                  </span>
                  <span className={`num shrink-0 ${row.delta > 0 ? "text-gold" : "text-red-300"}`}>
                    {signed(row.delta)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          className="min-h-11 text-parchment/80 hover:text-gold"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
