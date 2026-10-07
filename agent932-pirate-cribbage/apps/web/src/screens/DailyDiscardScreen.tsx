import { useCallback, useEffect, useMemo, useState } from "react";
import { NavBar } from "../components/NavBar.js";
import {
  ACHIEVEMENTS,
  type Card as CardType,
  DAILY_BEST,
  DAILY_PLAYED,
  type DiscardAnalysis,
  analyzeDiscard,
  cardLabel,
  dailyDeal,
  parseCard,
  sameCard,
} from "@pirate/engine";
import { ApiError, type Reward, api } from "../api.js";
import { useAuth } from "../auth.js";
import { achievementArt } from "../components/Achievements.js";
import { Card, cardName } from "../components/Card.js";
import { EarnHint, RewardSummary } from "../components/Doubloons.js";
import { CRIBBAGE_HOME } from "../routes.js";

const STORE = "pc.daily";

/** Guests' record, kept in this browser. Signed-in players' answers live on the server. */
interface DailyRecord {
  /** Day → your score that day (0-100). */
  days: Record<string, number>;
}

/** Today in the player's own time zone, as "2026-10-04". */
export function today(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function load(): DailyRecord {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "") as DailyRecord;
  } catch {
    return { days: {} };
  }
}

function save(record: DailyRecord) {
  try {
    localStorage.setItem(STORE, JSON.stringify(record));
  } catch {
    // Storage blocked: the puzzle still works, the streak just isn't kept.
  }
}

/** Days in a row, ending today, where you found the best discard. */
export function bestStreak(days: Record<string, number>, day: string) {
  let streak = 0;
  const d = new Date(`${day}T12:00:00`);
  while (days[today(d)] === 100) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

const twoCards = (cards: readonly CardType[]) => cards.map(cardLabel).join(" ");

/** What the server says about a day (see apps/server/src/daily/routes.ts). */
interface ServerResult {
  day: string;
  discard: [string, string];
  best: boolean;
}

/** /cribbage/daily: the same hand for everyone each day. Which two would you throw? */
export function DailyDiscardScreen() {
  const { user, loading } = useAuth();
  return (
    <>
      <NavBar title="Daily discard" back={{ to: CRIBBAGE_HOME, label: "Harbour" }} />
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 pt-2 pb-6">
        <h1 className="text-center font-pirate text-3xl text-gold">Daily discard</h1>
        {/* Signed-in players keep their answers and streak on the server; guests in this browser. */}
        {!loading && <DailyPuzzle key={user?.id ?? "guest"} signedIn={!!user} />}
      </main>
    </>
  );
}

function DailyPuzzle({ signedIn }: { signedIn: boolean }) {
  const { refresh } = useAuth();
  const day = today();
  const { hand, isDealer } = useMemo(() => dailyDeal(day), [day]);
  const [record, setRecord] = useState(load);
  const [picked, setPicked] = useState<CardType[]>([]);
  const [result, setResult] = useState<DiscardAnalysis | null>(() => {
    if (signedIn || record.days[day] === undefined) return null;
    return analyzeDiscard(hand, findSaved(hand, day) ?? hand.slice(0, 2), isDealer);
  });
  // Signed in: the server's verdict and streak, once loaded.
  const [server, setServer] = useState<{ best: boolean | null; streak: number } | null>(null);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  // What this throw paid (only when it's thrown here, not one made earlier or on another device).
  const [reward, setReward] = useState<Reward | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showServer = useCallback(
    (r: ServerResult | null, streak: number) => {
      setResult(r ? analyzeDiscard(hand, r.discard.map(parseCard), isDealer) : null);
      setServer({ best: r?.best ?? null, streak });
    },
    [hand, isDealer],
  );

  // Today's answer (made on any device) and the streak.
  const fetchServer = useCallback(
    () =>
      api<{ result: ServerResult | null; streak: number }>(`/api/daily?day=${day}`).then(
        (r) => {
          showServer(r.result, r.streak);
          setError(null);
        },
        () => setError("Couldn't reach the ship's log. Check your connection and try again."),
      ),
    [day, showServer],
  );

  useEffect(() => {
    if (signedIn) void fetchServer();
  }, [signedIn, fetchServer]);

  function toggle(c: CardType) {
    if (result) return;
    setPicked((p) =>
      p.some((x) => sameCard(x, c))
        ? p.filter((x) => !sameCard(x, c))
        : p.length < 2
          ? [...p, c]
          : p,
    );
  }

  async function throwThem() {
    if (signedIn) {
      setBusy(true);
      setError(null);
      try {
        const r = await api<{
          result: ServerResult;
          streak: number;
          unlocked: string[];
          reward?: Reward;
        }>("/api/daily", { body: { day, cards: picked.map(cardLabel) } });
        showServer(r.result, r.streak);
        setUnlocked(r.unlocked);
        if (r.reward) {
          setReward(r.reward);
          // The account bar's balance.
          void refresh();
        }
      } catch (e) {
        // Already played on another device: show that answer instead.
        if (e instanceof ApiError && e.status === 409) await fetchServer();
        else setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
      return;
    }
    const analysis = analyzeDiscard(hand, picked, isDealer);
    const next = { days: { ...record.days, [day]: analysis.score } };
    setRecord(next);
    save(next);
    try {
      localStorage.setItem(`${STORE}.${day}`, twoCards(picked));
    } catch {
      // ignore
    }
    setResult(analysis);
  }

  if (signedIn && !server) {
    return (
      <section className="panel flex flex-col items-center gap-3 p-4 text-center" role="status">
        {error ? (
          <>
            <p className="text-sm">{error}</p>
            <button type="button" className="btn-primary" onClick={() => void fetchServer()}>
              Try again
            </button>
          </>
        ) : (
          <p className="text-sm text-parchment/80">Opening the ship's log...</p>
        )}
      </section>
    );
  }

  const isBest = result && (signedIn ? server?.best === true : result.score === 100);
  const streak = signedIn ? (server?.streak ?? 0) : bestStreak(record.days, day);
  return (
    <section className="panel flex flex-col items-center gap-3 p-4 text-center">
      <p className="text-sm text-parchment/85">
        {isDealer
          ? "You're the dealer, so the crib is yours. Throw two cards that help it."
          : "Your opponent deals, so the crib is theirs. Don't feed it."}
      </p>
      <div
        className="flex justify-center -space-x-2 sm:gap-1.5 sm:space-x-0"
        aria-label="Today's hand"
      >
        {hand.map((c) => {
          const chosen = (result ? result.chosen.discard : picked).some((x) => sameCard(x, c));
          return (
            <Card
              key={cardLabel(c)}
              card={c}
              selected={chosen}
              disabled={!!result}
              onClick={() => toggle(c)}
            />
          );
        })}
      </div>
      {!result && (
        <button
          type="button"
          className="btn-primary"
          disabled={picked.length !== 2 || busy}
          onClick={() => void throwThem()}
        >
          Throw to the crib
        </button>
      )}
      {error && server && (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="flex w-full flex-col gap-2" role="status">
          <p className="font-pirate text-2xl text-gold">
            {isBest
              ? "The best throw! Sharp eye, matey."
              : `${Math.round(result.score)} out of 100`}
          </p>
          {!isBest && (
            <p className="text-sm">
              Best: throw {result.best.discard.map(cardName).join(" and ")} (
              {result.best.ev.toFixed(1)} points expected; yours {result.chosen.ev.toFixed(1)}).
            </p>
          )}
          <ol className="mx-auto w-full max-w-sm text-left text-sm">
            {result.choices.slice(0, 5).map((ch, i) => (
              <li
                key={twoCards(ch.discard)}
                className={`flex justify-between rounded px-2 py-0.5 ${ch === result.chosen ? "bg-gold/20 font-bold" : ""}`}
              >
                <span>
                  {i + 1}. Throw {twoCards(ch.discard)}
                </span>
                <span className="tabular-nums">{ch.ev.toFixed(1)}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-parchment/70">
            Points expected: your hand over every possible cut, {isDealer ? "plus" : "minus"} the
            average crib those two cards make. A new hand comes tomorrow.
          </p>
          {!signedIn && (
            <EarnHint>
              Sign in to earn doubloons for the daily discard ({DAILY_PLAYED}, or {DAILY_BEST} for
              the best throw).
            </EarnHint>
          )}
        </div>
      )}
      {/* The reward lists any new achievement itself, with what it paid. */}
      {reward && <RewardSummary reward={reward} className="w-full" />}
      {!reward &&
        unlocked.map((key) => (
          <p
            key={key}
            className="flex items-center gap-2 rounded-xl border border-gold/60 bg-gold/15 p-2 text-sm"
          >
            <img src={achievementArt(key)} alt="" className="h-9 w-9 object-contain" />
            <span>
              <b className="text-gold">New achievement:</b>{" "}
              {ACHIEVEMENTS.find((a) => a.key === key)?.name ?? key}
            </span>
          </p>
        ))}
      <p className="text-sm text-parchment/80">
        Best-throw streak: <b className="text-gold">{streak}</b> day{streak === 1 ? "" : "s"}
      </p>
    </section>
  );
}

/** The two cards you threw today, if you've played. */
function findSaved(hand: readonly CardType[], day: string): CardType[] | null {
  try {
    const labels = (localStorage.getItem(`${STORE}.${day}`) ?? "").split(" ");
    const cards = hand.filter((c) => labels.includes(cardLabel(c)));
    return cards.length === 2 ? cards : null;
  } catch {
    return null;
  }
}
