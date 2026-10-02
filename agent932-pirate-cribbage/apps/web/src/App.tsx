import { useEffect, useMemo, useState } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { ApiError, type GameResponse, api } from "./api.js";
import { AuthProvider, useAuth } from "./auth.js";
import { type LocalGame, loadGame, newLocalGame, saveGame } from "./game/localGame.js";
import { type MenuChoice, rulesFor } from "./game/menu.js";
import { useLocalGame } from "./game/useLocalGame.js";
import { useRemoteGame } from "./game/useRemoteGame.js";
import { AuthScreen } from "./screens/AuthScreen.js";
import { GameScreen } from "./screens/GameScreen.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { StatsScreen } from "./screens/StatsScreen.js";

/** The game being played: in the browser (guests) or on the server (signed in, counts for stats). */
type Session = { kind: "local"; game: LocalGame } | { kind: "remote"; res: GameResponse };

interface PlayProps {
  onExit: () => void;
  onPlayAgain: () => void;
  botDelay?: number;
}

function LocalPlay({ game, botDelay, ...rest }: PlayProps & { game: LocalGame }) {
  return <GameScreen game={useLocalGame(game, botDelay)} {...rest} />;
}

function RemotePlay({ res, botDelay, ...rest }: PlayProps & { res: GameResponse }) {
  return <GameScreen game={useRemoteGame(res, botDelay)} {...rest} />;
}

function Routes({ botDelay }: { botDelay?: number }) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  // Bumped whenever a new game starts so the game screen remounts with fresh state.
  const [gameKey, setGameKey] = useState(0);
  const [lastChoice, setLastChoice] = useState<MenuChoice | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What "Resume" would pick up: your server game if signed in, otherwise the browser's saved game.
  const [refresh, setRefresh] = useState(0);
  const [remoteGame, setRemoteGame] = useState<GameResponse | null>(null);
  useEffect(() => {
    if (loading || !user) return;
    let live = true;
    api<{ game: GameResponse | null }>("/api/games/active")
      .then((r) => live && setRemoteGame(r.game))
      .catch(() => live && setRemoteGame(null));
    return () => {
      live = false;
    };
  }, [user, loading, refresh]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read storage when returning home
  const localSaved = useMemo(() => loadGame(), [refresh, session]);
  const resumable: Session | null = user
    ? remoteGame && { kind: "remote", res: remoteGame }
    : localSaved && { kind: "local", game: localSaved };

  function play(next: Session) {
    setSession(next);
    setGameKey((k) => k + 1);
    navigate("/play");
  }

  async function start(choice: MenuChoice) {
    setLastChoice(choice);
    setError(null);
    if (!user) {
      saveGame(null);
      return play({
        kind: "local",
        game: newLocalGame({ level: choice.level, rules: rulesFor(choice) }),
      });
    }
    setStarting(true);
    try {
      play({ kind: "remote", res: await api<GameResponse>("/api/games", { body: choice }) });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't reach the server");
    } finally {
      setStarting(false);
    }
  }

  const playProps: PlayProps = {
    botDelay,
    onExit: () => {
      setRefresh((n) => n + 1);
      navigate("/");
    },
    onPlayAgain: () => {
      if (lastChoice) void start(lastChoice);
      else navigate("/");
    },
  };

  return (
    <Switch>
      <Route path="/">
        <HomeScreen
          canResume={!!resumable}
          onResume={() => resumable && play(resumable)}
          onStart={(c) => void start(c)}
          starting={starting}
          error={error}
        />
      </Route>
      <Route path="/play">
        {!session ? (
          <Redirect to="/" />
        ) : session.kind === "local" ? (
          <LocalPlay key={gameKey} game={session.game} {...playProps} />
        ) : (
          <RemotePlay key={gameKey} res={session.res} {...playProps} />
        )}
      </Route>
      <Route path="/login">
        <AuthScreen mode="login" />
      </Route>
      <Route path="/signup">
        <AuthScreen mode="signup" />
      </Route>
      <Route path="/stats">
        {loading ? null : user ? <StatsScreen /> : <Redirect to="/login" />}
      </Route>
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

export function App({ botDelay }: { botDelay?: number } = {}) {
  return (
    <AuthProvider>
      <Routes botDelay={botDelay} />
    </AuthProvider>
  );
}
