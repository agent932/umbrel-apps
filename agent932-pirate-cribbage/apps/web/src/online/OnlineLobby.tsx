import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { tierFor } from "@pirate/engine";
import { useAuth } from "../auth.js";
import type { Menu } from "./protocol.js";
import { socket } from "./socket.js";

type Status = { kind: "idle" } | { kind: "searching" } | { kind: "invite"; code: string };

/** Quick Match and invites. Shown on the home screen to signed-in players. */
export function OnlineLobby() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [variant, setVariant] = useState<Menu["variant"]>("pirate");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [active, setActive] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const menu: Menu = { variant, powerCost: 0 };

  useEffect(() => {
    const release = socket.use();
    const stop = socket.listen((m) => {
      if (m.t === "hello") setActive(m.activeGames);
      if (m.t === "queued") setStatus({ kind: "searching" });
      if (m.t === "invite") setStatus({ kind: "invite", code: m.code });
      if (m.t === "matched") navigate(`/online/${m.gameId}`);
      if (m.t === "error" && !m.gameId) {
        setError(m.message);
        setStatus({ kind: "idle" });
      }
    });
    return () => {
      // Leaving the lobby stops searching; the server also forgets on disconnect.
      socket.send({ t: "cancelQueue" });
      stop();
      release();
    };
  }, [navigate]);

  const inviteLink = status.kind === "invite" ? `${location.origin}/join/${status.code}` : "";

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-gold/30 bg-sea-deep/60 p-5"
      aria-label="Play online"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-pirate text-2xl text-gold">Play online</h2>
        {user && (
          <Link
            href="/leaderboard"
            className="text-sm text-parchment/80 hover:text-gold"
            title="Ranked rating"
          >
            {tierFor(user.rating).name} · {user.rating}
          </Link>
        )}
      </div>

      {active.length > 0 && (
        <div className="flex flex-col gap-2">
          {active.map((id, i) => (
            <button
              key={id}
              type="button"
              className="btn-secondary"
              onClick={() => navigate(`/online/${id}`)}
            >
              Rejoin game {active.length > 1 ? i + 1 : ""} in progress
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2" role="group" aria-label="Online rules">
        {(["classic", "pirate"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={variant === v}
            disabled={status.kind !== "idle"}
            onClick={() => setVariant(v)}
            className={`flex-1 rounded-xl border px-3 py-2 capitalize ${variant === v ? "border-gold bg-gold/15" : "border-parchment/25"}`}
          >
            {v}
          </button>
        ))}
      </div>

      {status.kind === "idle" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => (setError(null), socket.send({ t: "queue", menu }))}
          >
            Quick match
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => (setError(null), socket.send({ t: "createInvite", menu }))}
          >
            Invite a friend
          </button>
          <button
            type="button"
            className="btn-secondary col-span-2"
            title="Classic rules; wins and losses move your rating"
            onClick={() => (
              setError(null),
              socket.send({ t: "queue", menu: { variant: "classic", powerCost: 0, ranked: true } })
            )}
          >
            🏆 Ranked match (classic rules)
          </button>
        </div>
      )}

      {status.kind === "searching" && (
        <div className="flex items-center justify-between gap-2" role="status">
          <span className="animate-pulse">🔭 Scanning the horizon for an opponent…</span>
          <button
            type="button"
            className="text-sm text-parchment/70 hover:text-gold"
            onClick={() => (socket.send({ t: "cancelQueue" }), setStatus({ kind: "idle" }))}
          >
            Cancel
          </button>
        </div>
      )}

      {status.kind === "invite" && (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-sm">Send this link to a friend. The game starts when they open it:</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteLink}
              aria-label="Invite link"
              className="min-w-0 flex-1 rounded-lg border border-parchment/30 bg-sea px-2 py-1 text-sm"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="btn-secondary px-3 py-1 text-sm"
              onClick={() => {
                void navigator.clipboard?.writeText(inviteLink).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-parchment/60">
            Code <b className="tracking-widest text-gold">{status.code}</b> · expires in an hour
          </p>
          <button
            type="button"
            className="self-start text-sm text-parchment/70 hover:text-gold"
            onClick={() => (
              socket.send({ t: "cancelInvite" }),
              setStatus({ kind: "idle" }),
              setCopied(false)
            )}
          >
            Cancel invite
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}

/** /join/:code — accept a friend's invite. */
export function JoinInvite({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const release = socket.use();
    const stop = socket.listen((m) => {
      if (m.t === "matched") navigate(`/online/${m.gameId}`, { replace: true });
      if (m.t === "error" && !m.gameId) setError(m.message);
    });
    socket.send({ t: "joinInvite", code });
    return () => {
      stop();
      release();
    };
  }, [code, navigate]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-pirate text-4xl text-gold">Joining the crew…</h1>
      {error ? (
        <>
          <p role="alert" className="text-red-300">
            {error}
          </p>
          <button type="button" className="btn-secondary" onClick={() => navigate("/")}>
            Back to the harbour
          </button>
        </>
      ) : (
        <p className="animate-pulse">Rowing out to meet your friend</p>
      )}
    </main>
  );
}
