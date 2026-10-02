import { useState } from "react";
import {
  type LocalGame,
  type LocalGameOptions,
  loadGame,
  newLocalGame,
  saveGame,
} from "./game/localGame.js";
import { GameScreen } from "./screens/GameScreen.js";
import { HomeScreen } from "./screens/HomeScreen.js";

export function App({ botDelay }: { botDelay?: number } = {}) {
  const [game, setGame] = useState<LocalGame | null>(null);
  // Bumped on "play again" so the game screen remounts with fresh state.
  const [gameKey, setGameKey] = useState(0);
  const [saved, setSaved] = useState(() => loadGame());

  const start = (options: LocalGameOptions) => {
    setGame(newLocalGame(options));
    setGameKey((k) => k + 1);
  };

  if (!game) {
    return (
      <HomeScreen
        canResume={!!saved}
        onResume={() => {
          setGame(saved);
          setGameKey((k) => k + 1);
        }}
        onStart={start}
      />
    );
  }
  return (
    <GameScreen
      key={gameKey}
      initial={game}
      botDelay={botDelay}
      onExit={() => {
        setSaved(loadGame());
        setGame(null);
      }}
      onPlayAgain={() => {
        saveGame(null);
        start(game.options);
      }}
    />
  );
}
