import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  type Card as CardType,
  type PowerId,
  cardLabel,
  cardValue,
  other,
  sameCard,
} from "@pirate/engine";
import { Cinematics } from "../brand/Cinematics.js";
import { PeggyChatter } from "../brand/PeggyChatter.js";
import { Board, PEG_COLORS } from "../components/Board.js";
import { SettingsButton } from "../components/SettingsButton.js";
import { playEvents } from "../sound.js";
import { Card } from "../components/Card.js";
import { CountThenShow } from "../components/Counting.js";
import { CutForDealPanel, CutReveal } from "../components/CutForDeal.js";
import { POWER_ICONS, PowerBar } from "../components/PowerBar.js";
import { Modal, RoundSummary, ShowList } from "../components/RoundSummary.js";
import type { FeedItem, GameController } from "../game/types.js";

interface Props {
  game: GameController;
  onExit: () => void;
  onPlayAgain: () => void;
  /** Skip animations (tests that play at full bot speed). */
  instant?: boolean;
}

export function GameScreen({ game, onExit, onPlayAgain, instant }: Props) {
  const { p, names: label, act, error, online } = game;
  const view = p.view;
  // Seat-relative: online you may be seat 1.
  const me = view.seat;
  const opp = other(me);
  const oppName = label[opp];

  // Sound effects for each new step.
  useEffect(() => {
    if (p.lastEvents.length) playEvents(p.lastEvents, me);
  }, [p.lastEvents, me]);
  const pirate = view.rules.pirate;
  // The selection belongs to one situation; when the phase or hand changes it's dropped.
  const situation = `${view.round}:${view.phase}:${view.hand.map(cardLabel).join()}`;
  const [selection, setSelection] = useState({ situation, cards: [] as CardType[] });
  const selected = selection.situation === situation ? selection.cards : [];
  const setSelected = (update: (cards: CardType[]) => CardType[]) =>
    setSelection({ situation, cards: update(selected) });

  const isSelected = (c: CardType) => selected.some((s) => sameCard(s, c));
  const toggle = (c: CardType, max: number) =>
    setSelected((sel) =>
      isSelected(c) ? sel.filter((s) => !sameCard(s, c)) : sel.length < max ? [...sel, c] : sel,
    );

  const myTurnToPeg = view.phase === "pegging" && view.toAct.includes(me);
  const mustDiscard = view.phase === "discard" && view.hand.length === 6;
  const mustCut = view.phase === "cut" && view.toAct.includes(me);
  const inPreplay = view.phase === "preplay" && view.needsReady;
  const count = view.pegging?.count ?? 0;

  // In pre-play, the cards you threw to the crib can be picked again for Rebury.
  const preplayPool = inPreplay ? [...view.hand, ...view.myDiscards] : view.hand;
  const inHand = (c: CardType) => view.hand.some((h) => sameCard(h, c));

  // Powers that need cards selected first only light up once the selection fits.
  const powerReady = view.powersNow.filter((p) => {
    if (p === "parley") return selected.length === 1;
    if (p === "pickpocket") return selected.length === 1 && inHand(selected[0]!);
    if (p === "rebury") return selected.length === 2;
    return true;
  });

  function triggerPower(power: PowerId) {
    switch (power) {
      case "parley":
      case "pickpocket":
        return act({ type: power, card: selected[0]! });
      case "rebury":
        return act({ type: "rebury", cards: selected });
      default:
        return act({ type: power });
    }
  }

  function onCardClick(c: CardType) {
    if (mustDiscard) return toggle(c, 2);
    if (inPreplay) return toggle(c, 2);
    if (myTurnToPeg) return act({ type: "play", card: c });
  }

  const waitingForMe = view.phase === "roundEnd" && !!online && !online.nextRoundReady.includes(me);
  const myMove = mustDiscard || mustCut || inPreplay || myTurnToPeg || waitingForMe;

  const prompt = mustDiscard
    ? `Throw two cards to ${view.dealer === me ? "your" : `${oppName}'s`} crib`
    : view.phase === "discard"
      ? `Waiting for ${oppName} to discard…`
      : mustCut
        ? "Cut the deck"
        : view.phase === "cut"
          ? `${oppName} is cutting…`
          : inPreplay
            ? "Use Pickpocket or Rebury, or set sail"
            : view.phase === "preplay"
              ? `Waiting for ${oppName}…`
              : myTurnToPeg
                ? `Your play — the count is ${count}`
                : view.phase === "pegging"
                  ? `${oppName} is thinking…`
                  : view.phase === "deal"
                    ? "Shuffling…"
                    : "";

  const pile = view.pegging
    ? view.pegging.played.slice(view.pegging.played.length - view.pegging.pile.length)
    : [];
  const cribLabel =
    view.cribOwner === me || (view.cribOwner === null && view.dealer === me)
      ? "Your crib"
      : `${oppName}'s crib`;

  // Before the first hand: both players cut the deck to see who deals.
  if (view.phase === "cutForDeal") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-3">
        <header className="flex items-center justify-between text-sm">
          <button type="button" className="text-parchment/70 hover:text-gold" onClick={onExit}>
            ← Harbour
          </button>
          <span className="flex items-center gap-2 text-parchment/70">
            {pirate ? "Pirate rules" : "Classic"}
            <SettingsButton />
          </span>
        </header>
        <CutForDealPanel
          view={view}
          names={label}
          onPick={(index) => act({ type: "pickCut", index })}
        />
        <Feed items={p.feed.slice(0, 3)} />
        {error && (
          <p role="alert" className="text-center text-sm text-red-300">
            {error}
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-3 px-4 py-3">
      <header className="flex items-center justify-between text-sm">
        <button type="button" className="text-parchment/70 hover:text-gold" onClick={onExit}>
          ← Harbour
        </button>
        <span className="flex items-center gap-2 text-parchment/70">
          Round {Math.max(view.round, 1)} · {pirate ? "Pirate rules" : "Classic"}
          <SettingsButton />
        </span>
        {online && view.phase !== "gameOver" && (
          <button
            type="button"
            className="text-parchment/60 hover:text-red-300"
            onClick={() => {
              if (window.confirm(`Abandon ship? ${oppName} wins this game.`)) online.forfeit();
            }}
          >
            Forfeit
          </button>
        )}
      </header>

      <PlayerStrip
        name={label[opp]}
        score={view.scores[opp]}
        dealer={view.dealer === opp}
        powersLeft={view.opponentPowersLeft}
        offline={online ? !online.online[opp] : false}
        returnBy={online?.returnBy[opp] ?? null}
      >
        {view.spied && view.phase === "discard" ? (
          <div className="flex gap-1" aria-label="Opponent's hand seen through the spyglass">
            {view.spied.map((c) => (
              <Card key={cardLabel(c)} card={c} small />
            ))}
          </div>
        ) : (
          <div
            className="flex -space-x-6"
            aria-label={`Opponent holds ${view.opponentCardCount} cards`}
          >
            {Array.from({ length: view.opponentCardCount }, (_, i) => (
              <Card key={i} small hidden />
            ))}
          </div>
        )}
      </PlayerStrip>

      <Board scores={view.scores} backPegs={p.backPegs} rules={view.rules} names={label} me={me} />

      <section className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <div className="flex flex-col items-center gap-1 text-[11px] text-parchment/70">
          <div className="relative">
            <Card small hidden label="Deck" />
            {view.cut && (
              <motion.div
                className="absolute top-0 left-3"
                initial={{ rotateY: 90 }}
                animate={{ rotateY: 0 }}
              >
                <Card card={view.cut} small label={`Cut card: ${cardLabel(view.cut)}`} />
              </motion.div>
            )}
          </div>
          <span>{view.cut ? "Cut" : "Deck"}</span>
        </div>

        <div className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl bg-sea-deep/50 p-2">
          {view.pegging ? (
            <>
              <div className="flex -space-x-5">
                <AnimatePresence>
                  {pile.map((p) => (
                    <motion.div
                      key={cardLabel(p.card)}
                      initial={{ y: p.seat === me ? 40 : -40, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                    >
                      <Card card={p.card} small />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <span className="num text-2xl text-gold lantern-glow" aria-label={`Count ${count}`}>
                {count}
              </span>
            </>
          ) : (
            <span className="text-center text-sm text-parchment/60">{prompt}</span>
          )}
        </div>

        <div className="flex flex-col items-center gap-1 text-[11px] text-parchment/70">
          <div className="relative h-14 w-10">
            {Array.from({ length: Math.min(view.cribCount, 4) }, (_, i) => (
              <div key={i} className="absolute" style={{ top: -i * 2, left: i * 1 }}>
                <Card small hidden label="Crib card" />
              </div>
            ))}
            {view.cribCount === 0 && (
              <div className="h-14 w-10 rounded-lg border border-dashed border-parchment/30" />
            )}
          </div>
          <span>{cribLabel}</span>
        </div>
      </section>

      <Feed items={p.feed.slice(0, 4)} />

      <PlayerStrip name={label[me]} score={view.scores[me]} dealer={view.dealer === me} you>
        <p className="text-sm text-parchment/85" aria-live="polite">
          {view.pegging ? prompt : ""}
          {online && myMove && <Countdown deadline={online.deadline} />}
        </p>
      </PlayerStrip>

      <section className="flex flex-col items-center gap-3">
        <div
          className="flex justify-center -space-x-3 sm:gap-1.5 sm:space-x-0"
          aria-label="Your hand"
        >
          {preplayPool.map((c) => {
            const inCrib = !inHand(c);
            const playable = myTurnToPeg && count + cardValue(c) <= 31;
            const clickable = mustDiscard || inPreplay || playable;
            return (
              <div key={cardLabel(c)} className="flex flex-col items-center">
                <Card
                  card={c}
                  selected={isSelected(c)}
                  disabled={!clickable}
                  onClick={() => onCardClick(c)}
                />
                {inCrib && <span className="mt-0.5 text-[10px] text-gold">in crib</span>}
              </div>
            );
          })}
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-2">
          {mustDiscard && (
            <button
              type="button"
              className="btn-primary"
              disabled={selected.length !== 2}
              onClick={() => act({ type: "discard", cards: selected })}
            >
              Throw to crib
            </button>
          )}
          {mustCut && (
            <button type="button" className="btn-primary" onClick={() => act({ type: "cut" })}>
              Cut the deck
            </button>
          )}
          {inPreplay && (
            <button type="button" className="btn-primary" onClick={() => act({ type: "ready" })}>
              Set sail ⛵
            </button>
          )}
        </div>

        {pirate && (
          <PowerBar
            powers={pirate.powers}
            left={view.powersLeft}
            ready={powerReady}
            cost={pirate.powerCost}
            onUse={triggerPower}
            hint={{
              parley: "Select one card first.",
              pickpocket: "Select one card from your hand first.",
              rebury: "Select the two cards you want in the crib.",
            }}
          />
        )}
      </section>

      <PeggyChatter events={p.lastEvents} me={me} />
      <CutReveal events={p.lastEvents} names={label} me={me} />
      {!instant && <Cinematics events={p.lastEvents} names={label} me={me} />}

      {view.phase === "roundEnd" && (
        <RoundSummary
          show={p.show}
          cut={view.cut}
          names={label}
          onNext={online && !waitingForMe ? undefined : () => act({ type: "nextRound" })}
          waitingNote={online && !waitingForMe ? `Waiting for ${oppName}…` : undefined}
          instant={instant}
          decision={view.myDiscardDecision}
          isDealer={view.dealer === me}
        />
      )}

      {view.phase === "gameOver" && (
        <Modal title={view.winner === me ? "Victory! 🏴‍☠️" : "Defeat…"}>
          <CountThenShow show={p.show} cut={view.cut} names={label} instant={instant}>
            {online?.forfeitedBy != null && (
              <p className="mb-2 text-center text-parchment/80">
                {online.forfeitedBy === me ? "You abandoned ship." : `${oppName} abandoned ship.`}
              </p>
            )}
            <p className="mb-3 text-center">
              {view.winner === me ? "Ye won" : `${oppName} won`} {view.scores[me]}–
              {view.scores[opp]}
              {view.skunk === 2 ? " — a double skunk!" : view.skunk === 1 ? " — a skunk!" : "."}
            </p>
            {p.show.length > 0 && <ShowList show={p.show} cut={view.cut} names={label} />}
            <div className="mt-4 flex gap-2">
              {!online && (
                <button
                  type="button"
                  className="btn-primary flex-1"
                  onClick={onPlayAgain}
                  autoFocus
                >
                  Play again
                </button>
              )}
              <button type="button" className="btn-secondary flex-1" onClick={onExit}>
                Harbour
              </button>
            </div>
          </CountThenShow>
        </Modal>
      )}
    </main>
  );
}

function PlayerStrip({
  name,
  score,
  dealer,
  you,
  powersLeft,
  offline,
  returnBy,
  children,
}: {
  name: string;
  offline?: boolean;
  /** When an offline opponent forfeits unless they're back. */
  returnBy?: number | null;
  score: number;
  dealer: boolean;
  you?: boolean;
  powersLeft?: PowerId[];
  children?: React.ReactNode;
}) {
  return (
    <section className="flex items-center justify-between gap-3" aria-label={name}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: you ? PEG_COLORS.me : PEG_COLORS.opponent }}
            aria-hidden
          />
          <span className="truncate font-semibold">{name}</span>
          {dealer && <span className="rounded bg-rum px-1.5 text-[10px] uppercase">dealer</span>}
          {offline && (
            <span className="rounded bg-red-900/60 px-1.5 text-[10px] uppercase" role="status">
              offline{returnBy ? <ReturnClock until={returnBy} /> : null}
            </span>
          )}
        </div>
        {powersLeft && powersLeft.length > 0 && (
          <div className="mt-0.5 text-xs" title="Powers left">
            {powersLeft.map((p) => (
              <span key={p} aria-label={p}>
                {POWER_ICONS[p]}
              </span>
            ))}
          </div>
        )}
        <div className="mt-1">{children}</div>
      </div>
      <span className="num text-4xl text-gold lantern-glow" aria-label={`${name} score`}>
        {score}
      </span>
    </section>
  );
}

function Feed({ items }: { items: FeedItem[] }) {
  return (
    <ol className="flex min-h-20 flex-col gap-0.5 text-sm" aria-label="Game log">
      {/* New lines slide in; old ones just drop off the end (animating them out overlapped new lines). */}

      {items.map((item, i) => (
        <motion.li
          key={item.id}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: i === 0 ? 1 : 0.6 - i * 0.1, x: 0 }}
          className="flex items-center justify-between gap-2"
        >
          <span className="truncate">{item.text}</span>
          {item.points !== 0 && (
            <span
              className={`shrink-0 rounded-full px-2 text-xs font-bold ${
                item.points > 0 ? "bg-gold/25 text-gold" : "bg-red-500/25 text-red-300"
              }`}
            >
              {item.points > 0 ? `+${item.points}` : item.points}
            </span>
          )}
        </motion.li>
      ))}
    </ol>
  );
}

/** Seconds left before the server moves for you. */
function Countdown({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  const secs = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span
      className={`ml-2 tabular-nums ${secs <= 10 ? "text-red-300" : "text-parchment/60"}`}
      title="Time to move"
    >
      ⏳ {secs}s
    </span>
  );
}

/** "· 4:12 to return": time left for a disconnected player before they forfeit. */
function ReturnClock({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.ceil((until - now) / 1000));
  const text = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return <span className="normal-case tabular-nums"> · {text} to return</span>;
}
