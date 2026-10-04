import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { SUPPORT_TOPICS, type SupportTopic } from "../screens/SupportScreen.js";

interface SupportMessage {
  id: string;
  name: string;
  email: string;
  topic: SupportTopic;
  message: string;
  username: string | null;
  createdAt: string;
}

/** Admin: messages from the support page. Done with one? Delete it. */
export function SupportInbox() {
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const load = useCallback(
    () =>
      api<{ messages: SupportMessage[] }>("/api/admin/support").then((r) =>
        setMessages(r.messages),
      ),
    [],
  );
  useEffect(() => void load(), [load]);

  if (!messages) return <p className="text-parchment/60">Loading…</p>;
  if (messages.length === 0)
    return <p className="text-parchment/60">No messages. Calm seas, Captain.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {messages.map((m) => (
        <li key={m.id} className="flex flex-col gap-2 rounded-xl border border-parchment/15 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span>
              <b>{m.name}</b>{" "}
              <a className="text-gold underline" href={`mailto:${m.email}`}>
                {m.email}
              </a>
              {m.username && <span className="text-parchment/60"> · player {m.username}</span>}
            </span>
            <span className="text-xs text-parchment/60">
              {SUPPORT_TOPICS[m.topic] ?? m.topic} · {new Date(m.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap text-parchment/90">{m.message}</p>
          <button
            type="button"
            className="self-end rounded-xl border border-parchment/30 px-2 py-1 text-xs hover:border-gold"
            onClick={() => void api(`/api/admin/support/${m.id}`, { method: "DELETE" }).then(load)}
          >
            Done, delete
          </button>
        </li>
      ))}
    </ul>
  );
}
