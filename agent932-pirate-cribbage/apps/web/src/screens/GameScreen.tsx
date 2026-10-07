import { useEffect, useRef, useState } from "react";
import { type Card as CardType, type PowerId, cardLabel, other, sameCard } from "@pirate/engine";
import { Cinematics } from "../brand/Cinematics.js";
import { PeggyChatter } from "../brand/PeggyChatter.js";
import { avatarUrl } from "../brand/avatars.js";
import { BOT_CREW } from "../brand/botCrew.js";
import { SettingsButton } from "../components/SettingsButton.js";
import { TutorialTips } from "../components/TutorialTips.js";
import { CutForDealPanel, CutReveal } from "../components/CutForDeal.js";
import { RoundSummary } from "../components/RoundSummary.js";
import { EmoteButton } from "../components/table/EmoteButton.js";
import { Feed } from "../components/table/Feed.js";
import { GameOverPanel } from "../components/table/GameOverPanel.js";
import { OpponentFan } from "../components/table/OpponentFan.js";
import { PlayArea } from "../components/table/PlayArea.js";
import { Countdown, PlayerChip } from "../components/table/PlayerChip.js";
import { PlayerHand } from "../components/table/PlayerHand.js";
import { PowerPanel, PowersRail, readyPowers } from "../components/table/PowersRail.js";
import { ScorePops } from "../components/table/ScorePops.js";
import { TableBoard } from "../components/table/TableBoard.js";
import { TableMenu } from "../components/table/TableMenu.js";
import { PlayerSheet } from "../components/PlayerSheet.js";
import {
  LAST_PLAY_MS,
  RESET_HOLD_MS,
  useCallout,
  useLastPlay,
  useResetHold,
  useShowReveal,
} from "../components/table/tableHooks.js";
import type { GameController } from "../game/types.js";
import { buzz } from "../haptics.js";
import { EMOTES } from "../online/protocol.js";
import { playEvents } from "../sound.js";
import { SPEED_FACTOR, useSettings } from "../settings.js";
import menuUrl from "../assets/table/btn-menu.webp";

// The hook lives with the table's other parts; re-exported for its tests.
export { useLastPlay, useResetHold };

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
  /** Playing as a guest, so the result says how to earn doubloons. */
  guest?: boolean;
}

export function GameScreen({
  game,
  onExit,
  onPlayAgain,
  instant,
  myAvatar,
  tutorial,
  guest,
}: Props) {
  const { p, names: label, act, error, online } = game;
  const view = p.view;
  // Seat-relative: online you may be seat 1.
  const me = view.seat;
  const opp = other(me);
  const oppName = label[opp];
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  /** The power whose explanation is open (tap a power to see what it does, then use it). */
  const [powerInfo, setPowerInfo] = useState<PowerId | null>(null);
  const callout = useCallout(online?.emote ?? null);
  // During the show the pegs, sounds and log wait for each hand to be counted out.
  const shown = useShowReveal(p, !!instant);
  const events = shown.events;
  const { speed } = useSettings();

  // Sound effects for each new step.
  useEffect(() => {
    if (events.length) playEvents(events, me);
  }, [events, me]);
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

  const powerReady = readyPowers(view.powersNow, selected, inHand);

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

  const livePile = view.pegging
    ? view.pegging.played.slice(view.pegging.played.length - view.pegging.pile.length)
    : [];
  // When pegging ends, the last cards stay on the table for a moment so both players see them.
  // Bot games follow the speed setting (never shorter than two seconds); online it's the same for both.
  const holdMs = online
    ? LAST_PLAY_MS
    : Math.max(2000, Math.round(LAST_PLAY_MS * SPEED_FACTOR[speed]));
  const lastPlay = useLastPlay(livePile, count, !!view.pegging, p.lastEvents, !!instant, holdMs);
  // A run that ended on 31 or a Go stays up for a moment too, so its last card is seen.
  const resetMs = online ? RESET_HOLD_MS : Math.round(RESET_HOLD_MS * SPEED_FACTOR[speed]);
  const runOver = useResetHold(livePile, count, !!view.pegging, p.lastEvents, !!instant, resetMs);
  const pile = lastPlay?.pile ?? runOver?.pile ?? livePile;
  const shownCount = lastPlay?.count ?? runOver?.count ?? count;
  const shownPrompt = runOver && myTurnToPeg ? "Your play — the count starts again" : prompt;
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

  // The powers stand in one column down the right edge, or two when there are more than three.
  const powerCount = pirate?.powers.length ?? 0;
  const rail = powerCount === 0 ? "rail-none" : powerCount > 3 ? "rail-two" : "rail-one";

  return (
    <main className="table-stage">
      <div className={`table-grid ${rail}`}>
        <TableBoard
          scores={shown.scores}
          backPegs={shown.backPegs}
          rules={view.rules}
          names={label}
          me={me}
          instant={instant}
        />

        {/* Opponent: cards fanned along the top edge, their portrait in the porthole top right. */}
        <OpponentFan
          spied={view.spied && view.phase === "discard" ? view.spied : null}
          count={view.opponentCardCount}
          round={view.round}
        />
        <PlayerChip
          className="t-opp"
          porthole
          name={oppName}
          score={shown.scores[opp]}
          dealer={view.dealer === opp}
          image={online ? avatarUrl(online.avatars[opp]) : BOT_CREW[game.level ?? "hard"].portrait}
          powersLeft={pirate ? view.opponentPowersLeft : undefined}
          offline={online ? !online.online[opp] : false}
          returnBy={online?.returnBy[opp] ?? null}
          callout={callout?.seat === opp ? EMOTES[callout.emote] : null}
        />

        {/* What's happening now, and the last thing that happened. */}
        <div className="t-status flex flex-col items-center gap-0.5 text-center">
          {shownPrompt && (
            <p className="t-prompt" aria-live="polite">
              {shownPrompt}
            </p>
          )}
          <Feed className="t-log" items={shown.feed.slice(0, 1)} />
          {error && (
            <p role="alert" className="rounded-full bg-night/80 px-3 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>
        {/* The action plank has a fixed home bottom right, so nothing jumps when it comes and goes. */}
        <div className="t-act-home">{action}</div>

        <PlayArea
          view={view}
          me={me}
          pile={pile}
          count={shownCount}
          showPile={!!view.pegging || !!lastPlay}
          cribLabel={cribLabel}
        />

        <PlayerHand
          cards={preplayPool}
          hand={view.hand}
          round={view.round}
          selected={selected}
          count={count}
          myTurnToPeg={myTurnToPeg}
          choosing={mustDiscard || inPreplay}
          onCard={onCardClick}
        />
        <div className="t-you">
          <PlayerChip
            className="t-you-chip"
            callout={callout?.seat === me ? EMOTES[callout.emote] : null}
            name={label[me]}
            score={shown.scores[me]}
            dealer={view.dealer === me}
            image={avatarUrl(online ? online.avatars[me] : myAvatar)}
            you
          >
            {online && myMove && <Countdown deadline={online.deadline} />}
          </PlayerChip>
          {online && view.phase !== "gameOver" && <EmoteButton onSend={online.sendEmote} />}
        </div>

        <button
          ref={menuButton}
          type="button"
          className="t-round t-menu"
          style={{ backgroundImage: `url("${menuUrl}")` }}
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        />
        <PeggyChatter events={events} me={me} className="t-peggy" />
        {pirate && (
          <PowersRail
            powers={pirate.powers}
            powersLeft={view.powersLeft}
            ready={powerReady}
            onOpen={setPowerInfo}
          />
        )}
      </div>

      {powerInfo && pirate && (
        <PowerPanel
          power={powerInfo}
          used={!view.powersLeft.includes(powerInfo)}
          usable={powerReady.includes(powerInfo)}
          availableNow={view.powersNow.includes(powerInfo)}
          cost={pirate.powerCost}
          onUse={() => {
            triggerPower(powerInfo);
            setPowerInfo(null);
          }}
          onClose={() => setPowerInfo(null)}
        />
      )}

      {menuOpen && (
        <TableMenu
          round={view.round}
          pirate={!!pirate}
          oppName={oppName}
          onExit={onExit}
          onForfeit={online && view.phase !== "gameOver" ? online.forfeit : undefined}
          onReport={
            online
              ? () => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }
              : undefined
          }
          onClose={() => setMenuOpen(false)}
          opener={menuButton}
        />
      )}
      {reportOpen && online && (
        <PlayerSheet username={oppName} onClose={() => setReportOpen(false)} opener={menuButton} />
      )}

      {tutorial && <TutorialTips phase={view.phase} />}
      <CutReveal events={p.lastEvents} names={label} me={me} />
      {!instant && <ScorePops events={events} me={me} names={label} />}
      {!instant && (
        <Cinematics events={events} names={label} me={me} hold={!!lastPlay || !!runOver} />
      )}

      {view.phase === "roundEnd" && !lastPlay && (
        <RoundSummary
          show={p.show}
          cut={view.cut}
          names={label}
          onNext={online && !waitingForMe ? undefined : () => act({ type: "nextRound" })}
          waitingNote={online && !waitingForMe ? `Waiting for ${oppName}…` : undefined}
          instant={instant}
          onReveal={shown.reveal}
          decision={view.myDiscardDecision}
          isDealer={view.dealer === me}
        />
      )}

      {view.phase === "gameOver" && !lastPlay && (
        <GameOverPanel
          me={me}
          winner={view.winner}
          scores={view.scores}
          skunk={view.skunk}
          show={p.show}
          cut={view.cut}
          names={label}
          online={online}
          ranked={game.ranked}
          instant={instant}
          reward={game.reward ?? null}
          guest={!!guest}
          tutorial={!!tutorial}
          level={game.level}
          onReveal={shown.reveal}
          onPlayAgain={onPlayAgain}
          onExit={onExit}
        />
      )}
    </main>
  );
}
