import { useState } from "react";
import { EMOTES, type Emote } from "../../online/protocol.js";
import blankButtonUrl from "../../assets/table/btn-blank.webp";

/** The call-out button for online games, and its menu of things to shout. */
export function EmoteButton({ onSend }: { onSend: (emote: Emote) => void }) {
  const [emotesOpen, setEmotesOpen] = useState(false);
  return (
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
                onSend(e);
                setEmotesOpen(false);
              }}
            >
              {EMOTES[e]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
