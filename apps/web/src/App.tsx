import { useEffect, useState } from "react";
import { cardLabel, createDeck } from "@pirate/engine";

interface Health {
  status: string;
  db: string;
}

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  const sample = createDeck().slice(0, 5).map(cardLabel).join(" ");

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-16 text-center">
      <h1 className="font-pirate text-5xl text-gold sm:text-6xl">Pirate Cribbage</h1>
      <p className="text-lg">Fifteen-two, fifteen-four, and a pair be six, matey.</p>
      <div className="rounded-lg border border-gold/40 bg-sea-deep/60 px-6 py-4 font-mono text-sm">
        <p>Engine sample: {sample}</p>
        <p>
          Server:{" "}
          {error ? "unreachable" : health ? `${health.status} (db ${health.db})` : "checking…"}
        </p>
      </div>
    </main>
  );
}
