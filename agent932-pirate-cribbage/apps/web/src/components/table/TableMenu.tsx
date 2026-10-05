import { Link } from "wouter";
import { SettingsFields } from "../SettingsButton.js";

/** The table's menu: round and rules, the way out, forfeit (online) and settings. */
export function TableMenu({
  round,
  pirate,
  oppName,
  onExit,
  onForfeit,
  onClose,
}: {
  round: number;
  pirate: boolean;
  oppName: string;
  onExit: () => void;
  /** Online games that are still going. */
  onForfeit?: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Menu"
      className="absolute top-3 right-3 z-30 w-64 rounded-2xl border border-gold/40 bg-sea/95 p-4 text-sm text-parchment shadow-2xl"
    >
      <p className="mb-3 font-pirate text-xl text-gold">
        Round {Math.max(round, 1)} · {pirate ? "Pirate rules" : "Classic"}
      </p>
      <div className="flex flex-col gap-2">
        <button type="button" className="btn-secondary" onClick={onExit}>
          Harbour
        </button>
        <Link href="/" className="btn-secondary text-center">
          Home (all games)
        </Link>
        {onForfeit && (
          <button
            type="button"
            className="rounded-xl border border-red-400/50 px-5 py-2 font-bold text-red-200 hover:bg-red-900/30"
            onClick={() => {
              if (window.confirm(`Abandon ship? ${oppName} wins this game.`)) onForfeit();
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
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}
