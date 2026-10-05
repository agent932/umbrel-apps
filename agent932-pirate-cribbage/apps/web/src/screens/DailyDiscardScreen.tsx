import { useMemo, useState } from "react";
import { NavBar } from "../components/NavBar.js";
import {
  type Card as CardType,
  analyzeDiscard,
  cardLabel,
  dailyDeal,
  sameCard,
} from "@pirate/engine";
import { Card, cardName } from "../components/Card.js";
import { CRIBBAGE_HOME } from "../routes.js";

const STORE = "pc.daily";

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

/** /cribbage/daily: the same hand for everyone each day. Which two would you throw? */
export function DailyDiscardScreen() {
  const day = today();
  const { hand, isDealer } = useMemo(() => dailyDeal(day), [day]);
  const [record, setRecord] = useState(load);
  const [picked, setPicked] = useState<CardType[]>([]);
  const played = record.days[day];
  const [result, setResult] = useState(() =>
    played === undefined
      ? null
      : analyzeDiscard(hand, findSaved(hand, day) ?? hand.slice(0, 2), isDealer),
  );

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

  function throwThem() {
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

  const streak = bestStreak(record.days, day);
  return (
    <>
      <NavBar title="Daily discard" back={{ to: CRIBBAGE_HOME, label: "Harbour" }} />
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 pt-2 pb-6">
        <h1 className="text-center font-pirate text-3xl text-gold">Daily discard</h1>
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
              disabled={picked.length !== 2}
              onClick={throwThem}
            >
              Throw to the crib
            </button>
          )}
          {result && (
            <div className="flex w-full flex-col gap-2" role="status">
              <p className="font-pirate text-2xl text-gold">
                {result.score === 100
                  ? "The best throw! Sharp eye, matey."
                  : `${Math.round(result.score)} out of 100`}
              </p>
              {result.score !== 100 && (
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
                Points expected: your hand over every possible cut, {isDealer ? "plus" : "minus"}{" "}
                the average crib those two cards make. A new hand comes tomorrow.
              </p>
            </div>
          )}
          <p className="text-sm text-parchment/80">
            Best-throw streak: <b className="text-gold">{streak}</b> day{streak === 1 ? "" : "s"}
          </p>
        </section>
      </main>
    </>
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
