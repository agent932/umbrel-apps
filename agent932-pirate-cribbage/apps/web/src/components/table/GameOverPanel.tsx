import { type Card as CardType, type Seat, other } from "@pirate/engine";
import { NewAchievements } from "../Achievements.js";
import { CountThenShow } from "../Counting.js";
import { Modal, ShowList } from "../RoundSummary.js";
import type { OnlineInfo, ShowEvent } from "../../game/types.js";
import flagUrl from "../../assets/ui/icon-flag.webp";

/** The end of the game: the last hands counted, the result, and play again or rematch. */
export function GameOverPanel({
  me,
  winner,
  scores,
  skunk,
  show,
  cut,
  names: label,
  online,
  ranked,
  instant,
  onReveal,
  onPlayAgain,
  onExit,
}: {
  me: Seat;
  winner: Seat | null;
  scores: [number, number];
  skunk: number;
  show: ShowEvent[];
  cut: CardType | null;
  names: [string, string];
  online?: OnlineInfo;
  ranked: boolean;
  instant?: boolean;
  /** How many hands have been counted out, so the board can move their pegs. */
  onReveal?: (counted: number) => void;
  onPlayAgain: () => void;
  onExit: () => void;
}) {
  const opp = other(me);
  const oppName = label[opp];
  return (
    <Modal title={winner === me ? "Victory!" : "Defeat…"} seeBoard>
      {winner === me && <img src={flagUrl} alt="" className="mx-auto -mt-2 mb-2 h-16 w-auto" />}
      <CountThenShow show={show} cut={cut} names={label} instant={instant} onReveal={onReveal}>
        {online?.forfeitedBy != null && (
          <p className="mb-2 text-center text-parchment/80">
            {online.forfeitedBy === me ? "You abandoned ship." : `${oppName} abandoned ship.`}
          </p>
        )}
        <p className="mb-3 text-center">
          {winner === me ? "Ye won" : `${oppName} won`} {scores[me]}–{scores[opp]}
          {skunk === 2 ? " — a double skunk!" : skunk === 1 ? " — a skunk!" : "."}
        </p>
        {show.length > 0 && <ShowList show={show} cut={cut} names={label} />}
        {ranked && <NewAchievements />}
        <div className="mt-4 flex gap-2">
          {!online && (
            <button type="button" className="btn-primary flex-1" onClick={onPlayAgain} autoFocus>
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
  );
}
