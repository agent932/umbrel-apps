import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  type Card as CardType,
  type PowerId,
  cardLabel,
  cardValue,
  cryptoRandom,
  sameCard,
  viewFor,
} from "@pirate/engine";
import { Board } from "../components/Board.js";
import { Card } from "../components/Card.js";
import { POWER_ICONS, PowerBar } from "../components/PowerBar.js";
import { Modal, RoundSummary, ShowList } from "../components/RoundSummary.js";
import { BOT, type LocalGame, YOU, names } from "../game/localGame.js";
import { useLocalGame } from "../game/useLocalGame.js";

interface Props {
  initial: LocalGame;
  onExit: () => void;
  onPlayAgain: () => void;
  botDelay?: number;
}

export function GameScreen({ initial, onExit, onPlayAgain, botDelay }: Props) {
  const { game, act, error } = useLocalGame(initial, botDelay);
  const { state, options } = game;
  const view = viewFor(state, YOU);
  const label = names(options.level);
  const pirate = state.rules.pirate;
  // The selection belongs to one situation; when the phase or hand changes it's dropped.
  const situation = `${state.round}:${state.phase}:${view.hand.map(cardLabel).join()}`;
  const [selection, setSelection] = useState({ situation, cards: [] as CardType[] });
  const selected = selection.situation === situation ? selection.cards : [];
  const setSelected = (update: (cards: CardType[]) => CardType[]) =>
    setSelection({ situation, cards: update(selected) });

  const isSelected = (c: CardType) => selected.some((s) => sameCard(s, c));
  const toggle = (c: CardType, max: number) =>
    setSelected((sel) =>
      isSelected(c) ? sel.filter((s) => !sameCard(s, c)) : sel.length < max ? [...sel, c] : sel,
    );

  const myTurnToPeg = state.phase === "pegging" && view.toAct.includes(YOU);
  const mustDiscard = state.phase === "discard" && view.hand.length === 6;
  const mustCut = state.phase === "cut" && view.toAct.includes(YOU);
  const inPreplay = state.phase === "preplay" && view.needsReady;
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
      case "spyglass":
        return act({ type: "spyglass", seat: YOU });
      case "crowsNest":
        return act({
          type: "crowsNest",
          seat: YOU,
          index: Math.floor(cryptoRandom() * state.deck.length),
        });
      case "parley":
        return act({ type: "parley", seat: YOU, card: selected[0]! });
      case "pickpocket":
        return act({
          type: "pickpocket",
          seat: YOU,
          card: selected[0]!,
          index: Math.floor(cryptoRandom() * view.opponentCardCount),
        });
      case "rebury":
        return act({ type: "rebury", seat: YOU, cards: selected });
      case "belay":
        return act({ type: "belay", seat: YOU });
    }
  }

  function onCardClick(c: CardType) {
    if (mustDiscard) return toggle(c, 2);
    if (inPreplay) return toggle(c, 2);
    if (myTurnToPeg) return act({ type: "play", seat: YOU, card: c });
  }

  const prompt = mustDiscard
    ? `Throw two cards to ${state.dealer === YOU ? "your" : "Cap'n Bot's"} crib`
    : state.phase === "discard"
      ? "Waiting for Cap'n Bot to discard…"
      : mustCut
        ? "Cut the deck"
        : state.phase === "cut"
          ? "Cap'n Bot is cutting…"
          : inPreplay
            ? "Use Pickpocket or Rebury, or set sail"
            : state.phase === "preplay"
              ? "Waiting for Cap'n Bot…"
              : myTurnToPeg
                ? `Your play — the count is ${count}`
                : state.phase === "pegging"
                  ? "Cap'n Bot is thinking…"
                  : state.phase === "deal"
                    ? "Shuffling…"
                    : "";

  const pile = view.pegging
    ? view.pegging.played.slice(view.pegging.played.length - view.pegging.pile.length)
    : [];
  const cribLabel =
    view.cribOwner === YOU || (view.cribOwner === null && state.dealer === YOU)
      ? "Your crib"
      : "Bot's crib";

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-3 px-4 py-3">
      <header className="flex items-center justify-between text-sm">
        <button type="button" className="text-parchment/70 hover:text-gold" onClick={onExit}>
          ← Harbour
        </button>
        <span className="text-parchment/70">
          Round {Math.max(state.round, 1)} · {pirate ? "Pirate rules" : "Classic"}
        </span>
      </header>

      <PlayerStrip
        name={label[BOT]}
        score={state.scores[BOT]}
        dealer={state.dealer === BOT}
        powersLeft={view.opponentPowersLeft}
      >
        {view.spied && state.phase === "discard" ? (
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

      <Board scores={state.scores} backPegs={game.backPegs} rules={state.rules} names={label} />

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
                      initial={{ y: p.seat === YOU ? 40 : -40, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                    >
                      <Card card={p.card} small />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <span
                className="font-serif text-2xl font-bold tabular-nums text-gold"
                aria-label={`Count ${count}`}
              >
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

      <Feed items={game.feed.slice(0, 4)} />

      <PlayerStrip name={label[YOU]} score={state.scores[YOU]} dealer={state.dealer === YOU} you>
        <p className="text-sm text-parchment/85" aria-live="polite">
          {view.pegging ? prompt : ""}
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
              onClick={() => act({ type: "discard", seat: YOU, cards: selected })}
            >
              Throw to crib
            </button>
          )}
          {mustCut && (
            <button
              type="button"
              className="btn-primary"
              onClick={() =>
                act({ type: "cut", index: Math.floor(cryptoRandom() * state.deck.length) })
              }
            >
              Cut the deck
            </button>
          )}
          {inPreplay && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => act({ type: "ready", seat: YOU })}
            >
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

      {state.phase === "roundEnd" && (
        <RoundSummary
          show={game.show}
          cut={state.cut}
          names={label}
          onNext={() => act({ type: "nextRound" })}
        />
      )}

      {state.phase === "gameOver" && (
        <Modal title={state.winner === YOU ? "Victory! 🏴‍☠️" : "Defeat…"}>
          <p className="mb-3 text-center">
            {state.winner === YOU ? "Ye won" : "Cap'n Bot won"} {state.scores[YOU]}–
            {state.scores[BOT]}
            {state.skunk === 2 ? " — a double skunk!" : state.skunk === 1 ? " — a skunk!" : "."}
          </p>
          {game.show.length > 0 && <ShowList show={game.show} cut={state.cut} names={label} />}
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-primary flex-1" onClick={onPlayAgain} autoFocus>
              Play again
            </button>
            <button type="button" className="btn-secondary flex-1" onClick={onExit}>
              Harbour
            </button>
          </div>
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
  children,
}: {
  name: string;
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
          <span className={`h-2.5 w-2.5 rounded-full ${you ? "bg-gold" : "bg-[#e05252]"}`} />
          <span className="truncate font-semibold">{name}</span>
          {dealer && <span className="rounded bg-rum px-1.5 text-[10px] uppercase">dealer</span>}
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
      <span
        className="font-serif text-4xl font-bold tabular-nums text-gold"
        aria-label={`${name} score`}
      >
        {score}
      </span>
    </section>
  );
}

function Feed({ items }: { items: LocalGame["feed"] }) {
  return (
    <ol className="flex min-h-20 flex-col gap-0.5 text-sm" aria-label="Game log">
      <AnimatePresence initial={false}>
        {items.map((item, i) => (
          <motion.li
            key={item.id}
            layout
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
      </AnimatePresence>
    </ol>
  );
}
