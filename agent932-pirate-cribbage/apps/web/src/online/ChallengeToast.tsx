import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../auth.js";
import type { ServerMessage } from "./protocol.js";
import { socket } from "./socket.js";
import { CUTLASS_URL } from "../brand/powerArt.js";

type Incoming = Extract<ServerMessage, { t: "challenge" }>;

/**
 * Keeps the socket open while you're signed in, so friends can reach you, and pops up their
 * challenges wherever you are in the app.
 */
export function ChallengeToast() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const release = socket.use();
    const stop = socket.listen((m) => {
      if (m.t === "challenge")
        setIncoming((list) => [...list.filter((c) => c.challengeId !== m.challengeId), m]);
      if (m.t === "challengeDeclined") setNotice(`${m.by} declined your challenge`);
      if (m.t === "matched") {
        setIncoming([]);
        navigate(`/online/${m.gameId}`);
      }
    });
    return () => {
      stop();
      release();
    };
  }, [user, navigate]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  if (incoming.length === 0 && !notice) return null;
  const respond = (c: Incoming, accept: boolean) => {
    socket.send({ t: accept ? "acceptChallenge" : "declineChallenge", challengeId: c.challengeId });
    setIncoming((list) => list.filter((x) => x.challengeId !== c.challengeId));
  };

  return (
    <div
      className="fixed inset-x-0 bottom-4 z-30 mx-auto flex max-w-md flex-col gap-2 px-4"
      aria-live="polite"
    >
      {incoming.map((c) => (
        <div
          key={c.challengeId}
          role="alert"
          className="rounded-xl border border-gold bg-sea p-3 shadow-2xl"
        >
          <p>
            <img src={CUTLASS_URL} alt="" className="mr-1 inline h-5 w-5 align-[-4px]" />
            <b className="text-gold">{c.from.username}</b> challenges you to a{" "}
            {c.menu.ranked ? "ranked" : c.menu.variant} game!
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn-primary flex-1 py-1.5"
              onClick={() => respond(c, true)}
            >
              Accept
            </button>
            <button
              type="button"
              className="btn-secondary flex-1 py-1.5"
              onClick={() => respond(c, false)}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-parchment/30 bg-sea p-3 text-sm shadow-xl"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
