import { type RefObject, useRef, useState } from "react";
import { EMOTES, type Emote } from "../../online/protocol.js";
import { useDialog } from "../useDialog.js";
import blankButtonUrl from "../../assets/table/btn-blank.webp";

/** The call-out button for online games, and its menu of things to shout. */
export function EmoteButton({ onSend }: { onSend: (emote: Emote) => void }) {
  const [emotesOpen, setEmotesOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <div className="t-emote">
      <button
        ref={button}
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
        <EmoteMenu
          opener={button}
          onClose={() => setEmotesOpen(false)}
          onSend={(e) => {
            onSend(e);
            setEmotesOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** The call-outs, over the table: Escape or a tap outside closes it, focus back on the button. */
function EmoteMenu({
  opener,
  onClose,
  onSend,
}: {
  opener: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSend: (emote: Emote) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // It sits inside the table, so the table stays live behind it.
  useDialog(panel, { opener, onClose, dismissOutside: true, modal: false });
  return (
    <div
      ref={panel}
      className="t-emote-menu panel flex w-48 flex-col gap-1 p-2"
      role="menu"
      aria-label="Call outs"
    >
      {(Object.keys(EMOTES) as Emote[]).map((e) => (
        <button
          key={e}
          type="button"
          role="menuitem"
          className="min-h-11 rounded-lg px-3 py-1.5 text-left text-sm font-bold hover:bg-gold/20"
          onClick={() => onSend(e)}
        >
          {EMOTES[e]}
        </button>
      ))}
    </div>
  );
}
