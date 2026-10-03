import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  type Card as CardType,
  type PowerId,
  type Seat,
  POWER_INFO,
  cardLabel,
  cardValue,
  other,
  sameCard,
} from "@pirate/engine";
import { Cinematics } from "../brand/Cinematics.js";
import { PeggyChatter } from "../brand/PeggyChatter.js";
import { PEG_COLORS, POWER_ART } from "../brand/powerArt.js";
import { SettingsButton, SettingsFields } from "../components/SettingsButton.js";
import { PaintedBoard } from "../components/table/PaintedBoard.js";
import { HandSlot } from "../components/table/HandSlot.js";
import { ScorePops } from "../components/table/ScorePops.js";
import { buzz } from "../haptics.js";
import { avatarUrl } from "../brand/avatars.js";
import { BOT_CREW } from "../brand/botCrew.js";
import { NewAchievements } from "../components/Achievements.js";
import { TutorialTips } from "../components/TutorialTips.js";
import { EMOTES, type Emote } from "../online/protocol.js";
import blankButtonUrl from "../assets/table/btn-blank.webp";
import { playEvents } from "../sound.js";
import { Card } from "../components/Card.js";
import { CountThenShow } from "../components/Counting.js";
import { CutForDealPanel, CutReveal } from "../components/CutForDeal.js";
import { Modal, RoundSummary, ShowList } from "../components/RoundSummary.js";
import type { FeedItem, GameController } from "../game/types.js";
import menuUrl from "../assets/table/btn-menu.webp";
import hourglassUrl from "../assets/ui/icon-hourglass.webp";
import flagUrl from "../assets/ui/icon-flag.webp";

interface Props {
  game: GameController;
  onExit: () => void;
  onPlayAgain: () => void;
  /** Skip animations (tests that play at full bot speed). */
  instant?: boolean;
  /** The signed-in player's crew portrait, for games against the computer. */
  myAvatar?: number | null;
  /** "Learn to play": Peggy explains each step. */
  tutorial?: boolean;
}

export function GameScreen({ game, onExit, onPlayAgain, instant, myAvatar, tutorial }: Props) {
  const { p, names: label, act, error, online } = game;
  const view = p.view;
  // Seat-relative: online you may be seat 1.
  const me = view.seat;
  const opp = other(me);
  const oppName = label[opp];
  const upright = useUpright();
  const [menuOpen, setMenuOpen] = useState(false);
  const [emotesOpen, setEmotesOpen] = useState(false);
  const callout = useCallout(online?.emote ?? null);

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
    if (myTurnToPeg) {
      buzz();
      act({ type: "play", card: c });
    }
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
      <main className="table-stage">
        <div className="relative z-[1] mx-auto flex h-full max-w-2xl flex-col gap-4 overflow-y-auto px-4 py-3">
          <header className="flex items-center justify-between text-sm">
            <button type="button" className="text-parchment/80 hover:text-gold" onClick={onExit}>
              ← Harbour
            </button>
            <span className="flex items-center gap-2 text-parchment/80">
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
          {tutorial && <TutorialTips phase={view.phase} />}
          {error && (
            <p role="alert" className="text-center text-sm text-red-300">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }

  const action = mustDiscard ? (
    <button
      type="button"
      className="t-plank t-act"
      disabled={selected.length !== 2}
      onClick={() => act({ type: "discard", cards: selected })}
    >
      Throw to crib
    </button>
  ) : mustCut ? (
    <button type="button" className="t-plank t-act" onClick={() => act({ type: "cut" })}>
      Cut the deck
    </button>
  ) : inPreplay ? (
    <button type="button" className="t-plank t-act" onClick={() => act({ type: "ready" })}>
      Set sail
    </button>
  ) : null;

  return (
    <main className="table-stage">
      <div className="table-grid">
        <div className="t-board">
          <PaintedBoard
            scores={view.scores}
            backPegs={p.backPegs}
            rules={view.rules}
            names={label}
            me={me}
            upright={upright}
            instant={instant}
          />
        </div>

        {/* Opponent: cards along the top edge, portrait and score beside them. */}
        {view.spied && view.phase === "discard" ? (
          <div className="t-opp-fan" aria-label="Opponent's hand seen through the spyglass">
            {view.spied.map((c, i) => (
              <div key={cardLabel(c)} className="t-slot" style={fan(i, view.spied!.length)}>
                <Card card={c} fluid />
              </div>
            ))}
          </div>
        ) : (
          <div className="t-opp-fan" aria-label={`Opponent holds ${view.opponentCardCount} cards`}>
            {Array.from({ length: view.opponentCardCount }, (_, i) => (
              <div
                key={`${view.round}-${i}`}
                className="t-slot"
                style={fan(i, view.opponentCardCount)}
              >
                <div className="t-deal-in">
                  <Card fluid hidden />
                </div>
              </div>
            ))}
          </div>
        )}
        <PlayerChip
          className="t-opp-chip"
          name={oppName}
          score={view.scores[opp]}
          dealer={view.dealer === opp}
          image={online ? avatarUrl(online.avatars[opp]) : BOT_CREW[game.level ?? "hard"].portrait}
          powersLeft={pirate ? view.opponentPowersLeft : undefined}
          offline={online ? !online.online[opp] : false}
          returnBy={online?.returnBy[opp] ?? null}
          callout={callout?.seat === opp ? EMOTES[callout.emote] : null}
        />

        {/* What's happening now, and the last thing that happened. */}
        <div className="t-status flex max-w-[60cqw] flex-col items-center gap-1 text-center">
          {prompt && (
            <p
              className="rounded-full border border-gold/35 bg-night/80 px-4 py-1 text-sm font-bold"
              aria-live="polite"
            >
              {prompt}
            </p>
          )}
          <Feed items={p.feed.slice(0, 1)} />
          {error && (
            <p role="alert" className="rounded-full bg-night/80 px-3 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>
        {action}

        <div className="t-play flex items-center justify-between gap-2 px-[3cqw]">
          <div className="t-stack" aria-label={view.cut ? "Deck and cut card" : "Deck"}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="absolute" style={{ left: -i * 2, top: -i * 2 }}>
                <Card fluid hidden label="Deck" />
              </div>
            ))}
            {view.cut && (
              <motion.div
                className="absolute"
                style={{ left: "22%", top: "-12%", rotate: 8 }}
                initial={{ rotateY: 90 }}
                animate={{ rotateY: 0 }}
              >
                <Card card={view.cut} fluid label={`Cut card: ${cardLabel(view.cut)}`} />
              </motion.div>
            )}
            <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 text-[11px] whitespace-nowrap text-parchment/75">
              {view.cut ? "Cut" : "Deck"}
            </span>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
            {view.pegging && (
              <>
                <span className="t-medallion" aria-label={`Count ${count}`}>
                  {count}
                </span>
                <div className="t-pile flex">
                  <AnimatePresence>
                    {pile.map((p) => (
                      <motion.div
                        key={cardLabel(p.card)}
                        // From your hand below, or flipping over from the opponent's fan above.
                        initial={
                          p.seat === me
                            ? { y: "32vh", opacity: 0, scale: 1.15 }
                            : { y: "-28vh", opacity: 0, rotateY: 90 }
                        }
                        animate={{ y: 0, opacity: 1, scale: 1, rotateY: 0 }}
                        transition={{ type: "spring", stiffness: 260, damping: 24 }}
                      >
                        <Card card={p.card} fluid />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>

          <div className="t-stack" aria-label={cribLabel}>
            {Array.from({ length: Math.min(view.cribCount, 4) }, (_, i) => (
              <div key={i} className="absolute" style={{ left: i * 2, top: -i * 2 }}>
                <Card fluid hidden label="Crib card" />
              </div>
            ))}
            {view.cribCount === 0 && (
              <div className="h-full w-full rounded-lg border border-dashed border-parchment/35" />
            )}
            <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 text-[11px] whitespace-nowrap text-parchment/75">
              {cribLabel}
            </span>
          </div>
        </div>

        {/* Your hand, fanned along the bottom edge. */}
        <div className="t-hand" aria-label="Your hand">
          {preplayPool.map((c, i) => {
            const inCrib = !inHand(c);
            const playable = myTurnToPeg && count + cardValue(c) <= 31;
            const clickable = mustDiscard || inPreplay || playable;
            return (
              <HandSlot
                key={`${view.round}-${cardLabel(c)}`}
                i={i}
                n={preplayPool.length}
                selected={isSelected(c)}
                playable={playable}
                tooHigh={myTurnToPeg && !playable}
                onFlick={clickable ? () => onCardClick(c) : undefined}
              >
                <Card
                  card={c}
                  fluid
                  selected={isSelected(c)}
                  disabled={!clickable}
                  onClick={() => onCardClick(c)}
                />
                {inCrib && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full bg-night/85 px-2 text-[11px] whitespace-nowrap text-gold">
                    in crib
                  </span>
                )}
              </HandSlot>
            );
          })}
        </div>
        <PlayerChip
          className="t-you-chip"
          callout={callout?.seat === me ? EMOTES[callout.emote] : null}
          name={label[me]}
          score={view.scores[me]}
          dealer={view.dealer === me}
          image={avatarUrl(online ? online.avatars[me] : myAvatar)}
          you
        >
          {online && myMove && <Countdown deadline={online.deadline} />}
        </PlayerChip>

        <button
          type="button"
          className="t-round t-menu"
          style={{ backgroundImage: `url("${menuUrl}")` }}
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        />
        {pirate && pirate.powers.length > 0 && (
          <div
            className={`t-powers ${pirate.powers.length > 4 ? "many" : ""}`}
            role="group"
            aria-label="Pirate powers"
          >
            {pirate.powers.map((power) => {
              const used = !view.powersLeft.includes(power);
              const usable = powerReady.includes(power);
              const info = POWER_INFO[power];
              const hint = POWER_HINTS[power];
              return (
                <button
                  key={power}
                  type="button"
                  className={`t-round ${used ? "used" : usable ? "ready" : ""}`}
                  style={{ backgroundImage: `url("${POWER_ART[power]}")` }}
                  disabled={!usable}
                  onClick={() => triggerPower(power)}
                  aria-label={info.name}
                  title={`${info.name}: ${info.description}${pirate.powerCost ? ` Costs ${pirate.powerCost} points.` : ""}${hint && !used ? ` ${hint}` : ""}`}
                />
              );
            })}
          </div>
        )}
      </div>

      {online && view.phase !== "gameOver" && (
        <div className="t-emote">
          <button
            type="button"
            className="t-round grid place-items-center"
            style={{ backgroundImage: `url("${blankButtonUrl}")` }}
            aria-label="Call out"
            aria-expanded={emotesOpen}
            onClick={() => setEmotesOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
              <path
                d="M4 5h16v10H9l-4 4v-4H4z"
                fill="#f3e5c0"
                stroke="#3a2410"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {emotesOpen && (
            <div
              className="t-emote-menu panel flex w-48 flex-col gap-1 p-2"
              role="menu"
              aria-label="Call outs"
            >
              {(Object.keys(EMOTES) as Emote[]).map((e) => (
                <button
                  key={e}
                  type="button"
                  role="menuitem"
                  className="rounded-lg px-3 py-1.5 text-left text-sm font-bold hover:bg-gold/20"
                  onClick={() => {
                    online.sendEmote(e);
                    setEmotesOpen(false);
                  }}
                >
                  {EMOTES[e]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {menuOpen && (
        <div
          role="dialog"
          aria-label="Menu"
          className="absolute top-3 right-3 z-30 w-64 rounded-2xl border border-gold/40 bg-sea/95 p-4 text-sm text-parchment shadow-2xl"
        >
          <p className="mb-3 font-pirate text-xl text-gold">
            Round {Math.max(view.round, 1)} · {pirate ? "Pirate rules" : "Classic"}
          </p>
          <div className="flex flex-col gap-2">
            <button type="button" className="btn-secondary" onClick={onExit}>
              Harbour
            </button>
            {online && view.phase !== "gameOver" && (
              <button
                type="button"
                className="rounded-xl border border-red-400/50 px-5 py-2 font-bold text-red-200 hover:bg-red-900/30"
                onClick={() => {
                  if (window.confirm(`Abandon ship? ${oppName} wins this game.`)) online.forfeit();
                }}
              >
                Forfeit
              </button>
            )}
          </div>
          <div className="mt-4 border-t border-parchment/15 pt-3">
            <SettingsFields />
          </div>
          <button
            type="button"
            className="mt-3 w-full text-xs text-parchment/60 hover:text-gold"
            onClick={() => setMenuOpen(false)}
          >
            Close
          </button>
        </div>
      )}

      <PeggyChatter events={p.lastEvents} me={me} className="t-peggy" />
      {tutorial && <TutorialTips phase={view.phase} />}
      <CutReveal events={p.lastEvents} names={label} me={me} />
      {!instant && <ScorePops events={p.lastEvents} me={me} />}
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
        <Modal title={view.winner === me ? "Victory!" : "Defeat…"}>
          {view.winner === me && (
            <img src={flagUrl} alt="" className="mx-auto -mt-2 mb-2 h-16 w-auto" />
          )}
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
            {game.ranked && <NewAchievements />}
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
              {online && !online.ranked && online.forfeitedBy == null && (
                <button
                  type="button"
                  className="btn-primary flex-1"
                  disabled={online.rematch === "waiting"}
                  onClick={online.requestRematch}
                >
                  {online.rematch === "waiting"
                    ? `Waiting for ${oppName}…`
                    : online.rematch === "offered"
                      ? "Accept rematch"
                      : "Rematch"}
                </button>
              )}
              <button type="button" className="btn-secondary flex-1" onClick={onExit}>
                Harbour
              </button>
            </div>
            {online?.rematch === "offered" && (
              <p className="mt-2 text-center text-sm text-gold" role="status">
                {oppName} wants a rematch!
              </p>
            )}
          </CountThenShow>
        </Modal>
      )}
    </main>
  );
}

/** Where card i of n sits in a fan (the fan's shape is in `.t-slot` CSS). */
const fan = (i: number, n: number) => ({ "--i": i, "--n": n }) as React.CSSProperties;

const POWER_HINTS: Partial<Record<PowerId, string>> = {
  parley: "Select one card first.",
  pickpocket: "Select one card from your hand first.",
  rebury: "Select the two cards you want in the crib.",
};

/** True when the screen (and so the table, which fills it) is wider than tall: the board then
 * stands upright down the side. Matches the table's own landscape/portrait CSS. */
function useUpright() {
  const query = () =>
    typeof window === "undefined" || !window.matchMedia?.("(orientation: portrait)").matches;
  const [upright, setUpright] = useState(query);
  useEffect(() => {
    const mq = window.matchMedia?.("(orientation: portrait)");
    if (!mq) return;
    const update = () => setUpright(!mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return upright;
}

/** The latest call-out, for a couple of seconds. */
function useCallout(emote: { seat: Seat; emote: Emote; key: number } | null) {
  const [shown, setShown] = useState(emote);
  useEffect(() => {
    if (!emote) return;
    // Shown from an effect because it reacts to a message arriving.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown(emote);
    const t = setTimeout(() => setShown((s) => (s?.key === emote.key ? null : s)), 2600);
    return () => clearTimeout(t);
  }, [emote]);
  return shown;
}

function PlayerChip({
  className,
  name,
  score,
  dealer,
  you,
  image,
  powersLeft,
  offline,
  returnBy,
  callout,
  children,
}: {
  className: string;
  name: string;
  score: number;
  dealer: boolean;
  you?: boolean;
  /** A painted portrait instead of an initial. */
  image?: string | null;
  powersLeft?: PowerId[];
  offline?: boolean;
  /** When an offline opponent forfeits unless they're back. */
  returnBy?: number | null;
  /** Something they just called out ("Arr!"), shown in a speech bubble. */
  callout?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <section className={`t-chip relative ${className}`} aria-label={name}>
      {callout && (
        <span className="t-callout" role="status">
          {callout}
        </span>
      )}
      <span
        className="t-avatar"
        style={image ? { background: `url("${image}") center / 118% no-repeat` } : undefined}
        aria-hidden
      >
        {image ? "" : name.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm leading-tight font-bold">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: you ? PEG_COLORS.me : PEG_COLORS.opponent }}
          />
          <span className="truncate">{name}</span>
          {dealer && (
            <span className="rounded bg-rum px-1 text-[9px] tracking-wide uppercase">dealer</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="num text-xl leading-none text-gold" aria-label={`${name} score`}>
            {score}
          </span>
          {powersLeft && powersLeft.length > 0 && (
            <span className="flex gap-0.5" title="Powers left">
              {powersLeft.map((p) => (
                <img key={p} src={POWER_ART[p]} alt={p} className="h-4 w-4" />
              ))}
            </span>
          )}
          {offline && (
            <span className="rounded bg-red-900/70 px-1 text-[10px] uppercase" role="status">
              offline{returnBy ? <ReturnClock until={returnBy} /> : null}
            </span>
          )}
          {children}
        </span>
      </span>
    </section>
  );
}

function Feed({ items }: { items: FeedItem[] }) {
  return (
    <ol
      className="flex flex-col gap-0.5 text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
      aria-label="Game log"
    >
      {/* New lines slide in; old ones just drop off the end (animating them out overlapped new lines). */}

      {items.map((item, i) => (
        <motion.li
          key={item.id}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: i === 0 ? 1 : 0.6 - i * 0.1, x: 0 }}
          className="flex items-center justify-center gap-2"
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
      <img src={hourglassUrl} alt="" className="mr-0.5 inline h-4 w-4 align-[-3px]" />
      {secs}s
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
