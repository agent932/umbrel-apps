import { useState } from "react";
import { PIRATE_RULES, parseCard, parseCards, scoreHand } from "@pirate/engine";
import { ALL_SCENES, SceneOnce } from "../brand/Cinematics.js";
import { Card } from "../components/Card.js";
import { CountingShow } from "../components/Counting.js";
import { PaintedBoard } from "../components/table/PaintedBoard.js";

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
  const [pegs, setPegs] = useState<[number, number]>([60, 85]);
  const [skinId, setSkinId] = useState("serpent-reef");
  const [upright, setUpright] = useState(true);
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
      {/* The board with pegs anywhere, to check a skin's hole map and the hop. */}
      <section className="panel flex flex-col gap-3 p-4" aria-label="Board">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {(["You", "Opponent"] as const).map((who, i) => (
            <label key={who} className="flex items-center gap-2">
              {who}
              <input
                type="range"
                min={0}
                max={121}
                value={pegs[i]}
                onChange={(e) =>
                  setPegs((p) => (i === 0 ? [+e.target.value, p[1]] : [p[0], +e.target.value]))
                }
              />
              {pegs[i]}
            </label>
          ))}
          <select value={skinId} onChange={(e) => setSkinId(e.target.value)}>
            <option value="serpent-reef">Serpent Reef</option>
            <option value="classic-serpent">Classic Serpent</option>
          </select>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={upright}
              onChange={(e) => setUpright(e.target.checked)}
            />
            upright
          </label>
        </div>
        <div className={upright ? "mx-auto h-[640px] w-[230px]" : "h-[230px] w-full"}>
          <PaintedBoard
            scores={pegs}
            backPegs={[Math.max(0, pegs[0] - 6), Math.max(0, pegs[1] - 4)]}
            rules={PIRATE_RULES}
            names={["You", "Opponent"]}
            me={0}
            upright={upright}
            skinId={skinId}
          />
        </div>
      </section>
      {/* Every court card at every size the game uses, to check the corners stay readable. */}
      <section className="panel flex flex-col gap-4 p-4" aria-label="Court cards">
        {(["small", "normal", "fluid"] as const).map((size) => (
          <div
            key={size}
            className="flex flex-wrap gap-2"
            style={size === "fluid" ? ({ "--h": "150px" } as React.CSSProperties) : undefined}
          >
            {parseCards("JH QS KD JC 10H").map((c) => (
              <Card
                key={size + c.rank + c.suit}
                card={c}
                small={size === "small"}
                fluid={size === "fluid"}
              />
            ))}
          </div>
        ))}
      </section>
    </main>
  );
}
