import { useEffect, useMemo, useState } from "react";
import { Link, Redirect, Route, Switch, useLocation } from "wouter";
import { CLASSIC_RULES } from "@pirate/engine";
import { ApiError, type GameResponse, api } from "./api.js";
import { AuthProvider, useAuth } from "./auth.js";
import { MoonlitScene } from "./brand/MoonlitScene.js";
import { SPEED_FACTOR, useSettings } from "./settings.js";
import { type LocalGame, loadGame, newLocalGame, saveGame } from "./game/localGame.js";
import { type MenuChoice, rulesFor } from "./game/menu.js";
import { BOT_DELAY_MS, useLocalGame } from "./game/useLocalGame.js";
import { useRemoteGame } from "./game/useRemoteGame.js";
import { ChallengeToast } from "./online/ChallengeToast.js";
import { JoinInvite, OnlineLobby } from "./online/OnlineLobby.js";
import { useOnlineGame } from "./online/useOnlineGame.js";
import { AccountScreen } from "./screens/AccountScreen.js";
import { AnimationLab } from "./screens/AnimationLab.js";
import { AdminScreen } from "./screens/AdminScreen.js";
import { AuthScreen } from "./screens/AuthScreen.js";
import { FriendsScreen } from "./screens/FriendsScreen.js";
import { LeaderboardScreen } from "./screens/LeaderboardScreen.js";
import { GameScreen } from "./screens/GameScreen.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { StatsScreen } from "./screens/StatsScreen.js";
import { CRIBBAGE_HOME } from "./routes.js";
import { HubScreen } from "./screens/HubScreen.js";
import { ForgotScreen, ResetScreen } from "./screens/PasswordResetScreens.js";

/** The game being played: in the browser (guests) or on the server (signed in, counts for stats). */
type Session = { kind: "local"; game: LocalGame } | { kind: "remote"; res: GameResponse };

interface PlayProps {
  onExit: () => void;
  onPlayAgain: () => void;
  botDelay?: number;
}

/** The bot's thinking time: the speed setting, unless a test pins it. */
function useBotDelay(override?: number) {
  const { speed } = useSettings();
  return override ?? Math.round(BOT_DELAY_MS * SPEED_FACTOR[speed]);
}

function LocalPlay({ game, botDelay, ...rest }: PlayProps & { game: LocalGame }) {
  const { user } = useAuth();
  return (
    <GameScreen
      game={useLocalGame(game, useBotDelay(botDelay))}
      instant={botDelay === 0}
      myAvatar={user?.avatar ?? null}
      tutorial={!!game.options.practice}
      {...rest}
    />
  );
}

function RemotePlay({ res, botDelay, ...rest }: PlayProps & { res: GameResponse }) {
  const { user } = useAuth();
  return (
    <GameScreen
      game={useRemoteGame(res, useBotDelay(botDelay))}
      instant={botDelay === 0}
      myAvatar={user?.avatar ?? null}
      {...rest}
    />
  );
}

function OnlinePlay({ gameId, onExit }: { gameId: string; onExit: () => void }) {
  const game = useOnlineGame(gameId);
  const [, navigate] = useLocation();
  // Both players asked for a rematch: on to the new game.
  const rematch = "loading" in game ? null : (game.online?.rematchGameId ?? null);
  useEffect(() => {
    if (rematch) navigate(`/online/${rematch}`);
  }, [rematch, navigate]);
  if ("loading" in game) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
        {game.error ? (
          <>
            <p role="alert" className="text-red-300">
              {game.error}
            </p>
            <Link href={CRIBBAGE_HOME} className="btn-secondary">
              Back to the harbour
            </Link>
          </>
        ) : (
          <p className="animate-pulse">Boarding…</p>
        )}
      </main>
    );
  }
  return <GameScreen game={game} onExit={onExit} onPlayAgain={onExit} />;
}

function Routes({ botDelay }: { botDelay?: number }) {
  const { user, loading, refresh: refreshUser } = useAuth();
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
      navigate(CRIBBAGE_HOME);
    },
    onPlayAgain: () => {
      if (lastChoice) void start(lastChoice);
      else navigate(CRIBBAGE_HOME);
    },
  };

  return (
    <Switch>
      <Route path="/">
        <HubScreen />
      </Route>
      <Route path={CRIBBAGE_HOME}>
        <HomeScreen
          canResume={!!resumable}
          onResume={() => resumable && play(resumable)}
          onLearn={() =>
            play({
              kind: "local",
              game: newLocalGame({ level: "easy", rules: CLASSIC_RULES, practice: true }),
            })
          }
          onStart={(c) => void start(c)}
          starting={starting}
          error={error}
        >
          {user && <OnlineLobby />}
        </HomeScreen>
      </Route>
      <Route path="/online/:id">
        {(params) =>
          loading ? null : user ? (
            <OnlinePlay
              key={params.id}
              gameId={params.id}
              onExit={() => {
                // A ranked game may have moved your rating.
                void refreshUser();
                navigate(CRIBBAGE_HOME);
              }}
            />
          ) : (
            <Redirect to="/login" />
          )
        }
      </Route>
      <Route path="/join/:code">
        {(params) =>
          loading ? null : user ? (
            <JoinInvite code={params.code} />
          ) : (
            <AuthGate message="Sign up or log in to join your friend's game, then open the invite link again." />
          )
        }
      </Route>
      <Route path="/play">
        {!session ? (
          <Redirect to={CRIBBAGE_HOME} />
        ) : session.kind === "local" ? (
          <LocalPlay key={gameKey} game={session.game} {...playProps} />
        ) : (
          <RemotePlay key={gameKey} res={session.res} {...playProps} />
        )}
      </Route>
      <Route path="/forgot">
        <ForgotScreen />
      </Route>
      <Route path="/reset/:token">{(params) => <ResetScreen token={params.token} />}</Route>
      <Route path="/login">
        <AuthScreen mode="login" />
      </Route>
      <Route path="/signup">
        <AuthScreen mode="signup" />
      </Route>
      {import.meta.env.DEV && (
        <Route path="/lab">
          <AnimationLab />
        </Route>
      )}
      <Route path="/account">
        {loading ? null : user ? <AccountScreen /> : <Redirect to="/login" />}
      </Route>
      <Route path="/admin">
        {loading ? null : user?.isAdmin ? <AdminScreen /> : <Redirect to={CRIBBAGE_HOME} />}
      </Route>
      <Route path="/friends">
        {loading ? null : user ? <FriendsScreen /> : <Redirect to="/login" />}
      </Route>
      <Route path="/leaderboard">
        {loading ? null : user ? <LeaderboardScreen /> : <Redirect to="/login" />}
      </Route>
      <Route path="/stats">
        {loading ? null : user ? <StatsScreen /> : <Redirect to="/login" />}
      </Route>
      <Route>
        <Redirect to={CRIBBAGE_HOME} />
      </Route>
    </Switch>
  );
}

export function App({ botDelay }: { botDelay?: number } = {}) {
  return (
    <AuthProvider>
      <MoonlitScene />
      <Routes botDelay={botDelay} />
      <ChallengeToast />
    </AuthProvider>
  );
}

function AuthGate({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-pirate text-4xl text-gold">Ahoy!</h1>
      <p>{message}</p>
      <div className="flex gap-2">
        <Link href="/signup" className="btn-primary">
          Sign up
        </Link>
        <Link href="/login" className="btn-secondary">
          Log in
        </Link>
      </div>
    </main>
  );
}
