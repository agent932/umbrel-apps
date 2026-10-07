import type { GameEvent, Seat } from "@pirate/engine";
import { getSettings } from "./settings.js";
import cardPlace1 from "./assets/sounds/card-place-1.mp3";
import cardPlace2 from "./assets/sounds/card-place-2.mp3";
import cardPlace3 from "./assets/sounds/card-place-3.mp3";
import cardPlace4 from "./assets/sounds/card-place-4.mp3";
import cardSlide from "./assets/sounds/card-slide.mp3";
import cardShuffle from "./assets/sounds/card-shuffle.mp3";
import pegClick from "./assets/sounds/peg.mp3";
import coinsClink from "./assets/sounds/coins.mp3";

/**
 * Sound effects (Web Audio). Cards, pegs, the shuffle and coins are short recordings (Kenney's
 * CC0 packs, see assets/sounds/LICENSE.txt), bundled so they work offline; chimes and fanfares
 * are synthesized. Browsers only allow audio after the player has interacted with the page,
 * which is always true by the time a card is played.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!getSettings().sound || typeof AudioContext === "undefined") return null;
  if (!ctx) {
    ctx = new AudioContext();
    preload(ctx);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** The recordings, with several takes where one would sound repetitive. */
const SAMPLES = {
  card: [cardPlace1, cardPlace2, cardPlace3, cardPlace4],
  cut: [cardSlide],
  shuffle: [cardShuffle],
  peg: [pegClick],
  coins: [coinsClink],
};
const decoded = new Map<string, AudioBuffer>();

/** Fetch and decode every recording once, as soon as sound is first used. */
function preload(a: AudioContext) {
  for (const url of Object.values(SAMPLES).flat()) {
    void fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => a.decodeAudioData(data))
      .then((buffer) => decoded.set(url, buffer))
      .catch(() => {
        // Couldn't load it: the synthesized sound plays instead.
      });
  }
}

/**
 * Play a recording (a random take). False when it isn't loaded yet, so the caller can play the
 * synthesized sound instead; true when sound is off, since then nothing should play at all.
 */
function sample(name: keyof typeof SAMPLES, gain: number): boolean {
  const a = audio();
  if (!a) return true;
  const takes = SAMPLES[name];
  const buffer = decoded.get(takes[Math.floor(Math.random() * takes.length)]!);
  if (!buffer) return false;
  const src = a.createBufferSource();
  const g = a.createGain();
  src.buffer = buffer;
  g.gain.value = gain;
  src.connect(g).connect(a.destination);
  src.start();
  return true;
}

function tone(
  freq: number,
  start: number,
  length: number,
  type: OscillatorType = "triangle",
  gain = 0.12,
) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/** A short burst of filtered noise: the basis of card and wood sounds. */
function noise(start: number, length: number, freq: number, gain: number) {
  const a = audio();
  if (!a) return;
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * length), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  const filter = a.createBiquadFilter();
  const g = a.createGain();
  src.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = freq;
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(a.currentTime + start);
}

/** A card laid on the table. */
const cardFlick = () => {
  if (!sample("card", 0.45)) noise(0, 0.05, 2400, 0.25);
};

/** The cut: a card slid off the deck. */
const cutCard = () => {
  if (!sample("cut", 0.45)) noise(0, 0.05, 2400, 0.25);
};

/** A riffle shuffle. */
const shuffle = () => {
  if (sample("shuffle", 0.4)) return;
  for (let i = 0; i < 10; i++) noise(i * 0.045, 0.03, 2600 + (i % 3) * 300, 0.12);
};

/** A peg tapped into the next hole. */
export function pegTick() {
  if (sample("peg", 0.5)) return;
  noise(0, 0.03, 1100, 0.18);
  tone(820, 0, 0.05, "triangle", 0.04);
}

/** Rising chime, one note per couple of points (up to five). */
function score(points: number, mine: boolean) {
  const base = mine ? 660 : 440;
  const notes = Math.min(5, Math.max(1, Math.ceil(points / 2)));
  for (let i = 0; i < notes; i++) tone(base * 2 ** (i * (4 / 12)), i * 0.07, 0.18);
}

const fanfare = () =>
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, "square", 0.08));
const lament = () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.18, 0.4, "sawtooth", 0.06));
const coins = () => {
  if (sample("coins", 0.45)) return;
  [1568, 1976, 2349, 1976, 2637].forEach((f, i) => tone(f, i * 0.05, 0.12, "sine", 0.08));
};
const rumble = () => [110, 98, 82].forEach((f, i) => tone(f, i * 0.12, 0.5, "sawtooth", 0.1));

/** Play whatever fits a batch of game events, from `me`'s point of view. */
export function playEvents(events: GameEvent[], me: Seat) {
  for (const e of events) {
    switch (e.type) {
      case "played":
        cardFlick();
        if (e.score.total > 0) score(e.score.total, e.seat === me);
        break;
      case "go":
      case "lastCard":
        tone(e.seat === me ? 523 : 349, 0, 0.12, "square", 0.06);
        break;
      case "hand":
      case "crib":
        if (e.score.total > 0) score(e.score.total, e.seat === me);
        break;
      case "treasure":
        coins();
        break;
      case "kraken":
        rumble();
        break;
      case "gameOver":
        if (e.winner === me) fanfare();
        else lament();
        break;
      case "cut":
        cutCard();
        break;
      case "dealt":
        shuffle();
        break;
    }
  }
}

/** A short chime for each score while hands are counted out. */
export function chime(points: number) {
  const base = 784;
  tone(base * 2 ** (Math.min(points, 6) / 12), 0, 0.14, "triangle", 0.08);
}
