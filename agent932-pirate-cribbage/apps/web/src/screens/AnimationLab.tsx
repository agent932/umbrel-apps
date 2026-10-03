import { useState } from "react";
import { parseCard, parseCards, scoreHand } from "@pirate/engine";
import { ALL_SCENES, SceneOnce } from "../brand/Cinematics.js";
import { CountingShow } from "../components/Counting.js";

const CAPTIONS: Record<string, string> = {
  spyglass: "deckhand spies from the crow's nest!",
  cannon: "Fire! The cut is revealed",
  swing: "deckhand swings in for a parley!",
  loot: "deckhand pinches some loot!",
  trail: "deckhand reburies the treasure",
  slash: "Belay that!",
  chest: "Buried treasure! +3",
  sinking: "The Kraken! -4",
  plank: "The Black Spot! Bosun walks the plank",
  island: "Bosun is marooned!",
};

/** Development-only page: play any pirate scene or a sample count on demand. */
export function AnimationLab() {
  const [scene, setScene] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [counting, setCounting] = useState(false);
  const cut = parseCard("5S");
  const show = [
    {
      type: "hand" as const,
      seat: 1 as const,
      cards: parseCards("7H 8D 8C 9S"),
      score: scoreHand(parseCards("7H 8D 8C 9S"), cut),
    },
    {
      type: "hand" as const,
      seat: 0 as const,
      cards: parseCards("5H 5D 5C JS"),
      score: scoreHand(parseCards("5H 5D 5C JS"), cut),
    },
    {
      type: "crib" as const,
      seat: 0 as const,
      cards: parseCards("2H 4D 6C 8S"),
      score: scoreHand(parseCards("2H 4D 6C 8S"), cut, true),
    },
  ];
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-center font-pirate text-4xl text-gold">Animation lab</h1>
      <div className="flex flex-wrap justify-center gap-2">
        {ALL_SCENES.map((s) => (
          <button
            key={s}
            type="button"
            className="btn-secondary px-3 py-1 text-sm"
            onClick={() => (setScene(s), setRun((r) => r + 1), setCounting(false))}
          >
            {s}
          </button>
        ))}
        <button
          type="button"
          className="btn-primary px-3 py-1 text-sm"
          onClick={() => (setCounting(true), setScene(null), setRun((r) => r + 1))}
        >
          counting
        </button>
      </div>
      <div className="panel p-4" key={run}>
        {scene && <SceneOnce scene={scene as never} caption={CAPTIONS[scene]!} />}
        {counting && (
          <CountingShow
            show={show}
            cut={cut}
            names={["You", "Bosun"]}
            onDone={() => setCounting(false)}
          />
        )}
      </div>
    </main>
  );
}
