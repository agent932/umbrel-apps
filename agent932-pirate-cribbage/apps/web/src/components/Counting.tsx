import { useEffect, useState } from "react";
import {
  type Card as CardType,
  type GameEvent,
  type HandScore,
  type Seat,
  sameCard,
} from "@pirate/engine";
import { chime } from "../sound.js";
import { Card } from "./Card.js";

type ShowEvent = Extract<GameEvent, { type: "hand" | "crib" }>;

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "twenty-one",
  "twenty-two",
  "twenty-three",
  "twenty-four",
  "twenty-five",
  "twenty-six",
  "twenty-seven",
  "twenty-eight",
  "twenty-nine",
];
const say = (n: number) => NUMBER_WORDS[n] ?? String(n);

export interface CountStep {
  /** Cards that make this score (they light up). */
  cards: CardType[];
  points: number;
  /** What a player says, with the running total: "fifteen four", "a pair is six". */
  phrase: string;
}

/**
 * A hand's score as it's counted out loud, in the traditional order: fifteens, pairs, runs,
 * flush, then nobs, each with the running total.
 */
export function countingSteps(score: HandScore): CountStep[] {
  const steps: CountStep[] = [];
  let total = 0;
  const add = (cards: CardType[], points: number, phrase: (t: number) => string) => {
    total += points;
    steps.push({ cards, points, phrase: phrase(total) });
  };
  for (const f of score.fifteens) add(f, 2, (t) => `fifteen ${say(t)}`);
  score.pairs.forEach((p, i) =>
    add(p, 2, (t) => `${i === 0 ? "a pair" : "another pair"} is ${say(t)}`),
  );
  score.runs.forEach((r, i) =>
    add(
      r,
      r.length,
      (t) => `${i === 0 ? `a run of ${say(r.length)}` : "another run"} is ${say(t)}`,
    ),
  );
  if (score.flush.length) add(score.flush, score.flush.length, (t) => `a flush makes ${say(t)}`);
  if (score.nobs) add([score.nobs], 1, (t) => `one for his nob is ${say(t)}`);
  return steps;
}

/** "Your" for the viewer, "Bosun's" for anyone else. */
const whose = (name: string) => (name === "You" ? "Your" : `${name}'s`);

const STEP_MS = 550;
/** How long each hand's total stays up (while its peg moves on the board) before the next hand. */
export const HAND_PAUSE_MS = 1500;

/**
 * Counts each hand out in order (pone's hand, dealer's hand, then the crib): the cards in each
 * score light up and the running count builds, with a doubloon and a chime per score. Once a
 * hand's total is up, `onReveal` says how many hands are counted, so the board can move that peg.
 * Tap the panel to hurry to the next total, or Skip to jump to the totals.
 */
export function CountingShow({
  show,
  cut,
  names,
  onDone,
  onReveal,
}: {
  show: ShowEvent[];
  cut: CardType | null;
  names: [string, string];
  onDone: () => void;
  onReveal?: (counted: number) => void;
}) {
  const [hand, setHand] = useState(0);
  const [step, setStep] = useState(0);
  const current = show[hand];
  const steps = current ? countingSteps(current.score) : [];
  const finished = step >= steps.length;

  useEffect(() => {
    if (current && finished) onReveal?.(hand + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand, finished, current]);

  /** A tap: finish this hand's count at once, or if it's done, move on to the next hand. */
  function hurry() {
    if (!finished) setStep(steps.length);
    else {
      setHand(hand + 1);
      setStep(0);
    }
  }

  useEffect(() => {
    if (!current) {
      onDone();
      return;
    }
    const lastStep = step >= steps.length;
    // Hands with lots to call (like a 29) count faster, so none takes too long.
    const stepMs = steps.length > 8 ? 320 : STEP_MS;
    const t = setTimeout(
      () => {
        if (!lastStep) {
          chime(steps[step]!.points);
          setStep(step + 1);
        } else {
          setHand(hand + 1);
          setStep(0);
        }
      },
      lastStep ? HAND_PAUSE_MS : step === 0 ? 500 : stepMs,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand, step, current]);

  if (!current) return null;
  const lit = step > 0 ? steps[step - 1]!.cards : [];
  const isLit = (c: CardType) => lit.some((l) => sameCard(l, c));
  const said = steps.slice(0, step).map((s) => s.phrase);

  return (
    // Tapping anywhere on the count hurries it along; the buttons below do the same for keyboards.
    <section
      className="flex cursor-pointer flex-col items-center gap-3"
      aria-label="Counting the hands"
      aria-live="polite"
      onClick={hurry}
    >
      <p className="text-sm text-parchment/70">
        {hand + 1} of {show.length}
      </p>
      <h3 className="font-semibold">
        {whose(names[current.seat as Seat])} {current.type === "crib" ? "crib" : "hand"}
      </h3>
      <div className="flex items-end gap-1.5">
        {[...current.cards, ...(cut ? [cut] : [])].map((c, i) => (
          <div
            key={i}
            className={`transition-all duration-300 ${isLit(c) ? "-translate-y-3 drop-shadow-[0_0_12px_rgba(242,184,75,0.9)]" : lit.length ? "opacity-60" : ""} ${i === current.cards.length ? "ml-2" : ""}`}
          >
            <Card card={c} small label={i === current.cards.length ? "Cut card" : undefined} />
          </div>
        ))}
      </div>

      <div className="relative min-h-[3.5rem] w-full text-center">
        {step > 0 && (
          <span
            key={`${hand}-${step}`}
            className="pointer-events-none absolute -top-5 right-2 rounded-full bg-gold px-2 text-sm font-extrabold text-night shadow-[0_0_12px_rgba(242,184,75,0.7)]"
            style={{ animation: "float-up-right 700ms ease-out forwards" }}
            aria-hidden
          >
            +{steps[step - 1]!.points}
          </span>
        )}
        <p className="text-lg">
          {said.length === 0 && !finished && <span className="text-parchment/50">Counting…</span>}
          {said.map((p, i) => (
            <span
              key={i}
              className={i === said.length - 1 ? "font-bold text-gold" : "text-parchment/80"}
            >
              {i === 0 ? p[0]!.toUpperCase() + p.slice(1) : p}
              {i < said.length - 1 ? ", " : ""}
            </span>
          ))}
          {finished && steps.length === 0 && (
            <span className="text-parchment/80">Nineteen! Nothing at all. Awk.</span>
          )}
        </p>
        {finished && (
          <p
            className="num mt-1 text-3xl text-gold lantern-glow"
            style={{ animation: "pop-in 200ms ease-out" }}
          >
            {current.score.total}
          </p>
        )}
      </div>

      <div className="flex gap-6">
        <button
          type="button"
          className="text-sm text-parchment/60 hover:text-gold"
          onClick={(e) => {
            e.stopPropagation();
            hurry();
          }}
        >
          Next ›
        </button>
        <button
          type="button"
          className="text-sm text-parchment/60 hover:text-gold"
          onClick={(e) => {
            e.stopPropagation();
            onDone();
          }}
        >
          Skip ⏭
        </button>
      </div>
    </section>
  );
}

/** Plays the count first (unless `instant`), then shows `children` (the totals). */
export function CountThenShow({
  show,
  cut,
  names,
  instant,
  onReveal,
  children,
}: {
  show: ShowEvent[];
  cut: CardType | null;
  names: [string, string];
  instant?: boolean;
  /** How many hands have been counted out so far (all of them once the totals show). */
  onReveal?: (counted: number) => void;
  children: React.ReactNode;
}) {
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // Reduced motion skips the counting animation, not the totals: they show (and the pegs move) at once.
  const [counted, setCounted] = useState(instant || reduceMotion || show.length === 0);
  useEffect(() => {
    if (counted) onReveal?.(show.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counted, show.length]);
  if (!counted)
    return (
      <CountingShow
        show={show}
        cut={cut}
        names={names}
        onDone={() => setCounted(true)}
        onReveal={onReveal}
      />
    );
  return <>{children}</>;
}
