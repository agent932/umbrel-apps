// Dev helper: a scripted online opponent. Signs in as the second test account (see .env.example),
// joins Quick Match (or an invite code), and plays with the medium bot's choices.
//   npx tsx scripts/dev-opponent.ts [classic|pirate|wait] [inviteCode]
// "wait" just stays online and accepts friend challenges.
import WebSocket from "ws";
import { chooseDiscard, choosePlay, type PlayerView } from "@pirate/engine";

const API = process.env.API ?? "http://localhost:3000";
const user = { username: "bosun", email: "bosun@example.test", password: "splice-the-mainbrace-7" };
const variant = process.argv[2] ?? "pirate";
const code = process.argv[3];

async function session(): Promise<string> {
  for (const [path, body] of [
    ["/api/auth/login", { login: user.username, password: user.password }],
    ["/api/auth/signup", user],
  ] as const) {
    const res = await fetch(API + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const cookie = res.headers.get("set-cookie");
    if (res.ok && cookie) return cookie.split(";")[0]!;
  }
  throw new Error("Could not sign in the dev opponent");
}

const cookie = await session();
const ws = new WebSocket(API.replace("http", "ws") + "/api/ws", { headers: { cookie } });
const send = (m: object) => ws.send(JSON.stringify(m));
let gameId = "";

function move(view: PlayerView, ready: number[]) {
  const mine = view.toAct.includes(view.seat);
  switch (view.phase) {
    case "discard":
      return view.hand.length === 6
        ? { type: "discard", cards: chooseDiscard(view.hand, view.dealer === view.seat) }
        : null;
    case "cut":
      return mine ? { type: "cut" } : null;
    case "preplay":
      return view.needsReady ? { type: "ready" } : null;
    case "pegging":
      return mine ? { type: "play", card: choosePlay(view) } : null;
    case "roundEnd":
      return ready.includes(view.seat) ? null : { type: "nextRound" };
    default:
      return null;
  }
}

ws.on("close", (code) => {
  console.log("connection closed", code);
  process.exit(1);
});
ws.on("open", () => {
  if (code) send({ t: "joinInvite", code });
  else if (variant !== "wait") send({ t: "queue", menu: { variant, powerCost: 0 } });
  else console.log("online and waiting for challenges…");
});
ws.on("message", (raw) => {
  const m = JSON.parse(String(raw));
  if (m.t === "matched") {
    gameId = m.gameId;
    console.log("matched", gameId);
    send({ t: "watch", gameId });
  }
  if (m.t === "error") console.log("error:", m.message);
  if (m.t === "queued") console.log(`waiting in the ${variant} Quick Match queue…`);
  if (m.t === "challenge") {
    console.log(`accepting ${m.from.username}'s challenge`);
    send({ t: "acceptChallenge", challengeId: m.challengeId });
  }
  if (m.t === "state") {
    if (m.step.view.phase === "gameOver") {
      console.log("game over, winner seat", m.step.view.winner);
      process.exit(0);
    }
    const action = move(m.step.view, m.nextRoundReady);
    // Think for a moment so a human can follow along.
    if (action) setTimeout(() => send({ t: "act", gameId, action }), 900);
  }
});
