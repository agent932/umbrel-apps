import type { ClientMessage, ServerMessage } from "./protocol.js";

type Listener = (m: ServerMessage) => void;

/**
 * One WebSocket per tab, shared by the lobby and games. Reconnects with backoff; `onOpen`
 * callbacks re-run after each reconnect so games can re-subscribe.
 */
class Socket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private openers = new Set<() => void>();
  private outbox: ClientMessage[] = [];
  private retry = 0;
  private users = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  connected = false;

  /** Start using the socket; returns a function to stop. The connection closes when nobody uses it. */
  use(): () => void {
    this.users++;
    if (!this.ws) this.open();
    return () => {
      this.users--;
      if (this.users === 0) this.shutdown();
    };
  }

  private open() {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.retry = 0;
      for (const m of this.outbox.splice(0)) ws.send(JSON.stringify(m));
      for (const f of this.openers) f();
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as ServerMessage;
      for (const l of this.listeners) l(m);
    };
    ws.onclose = (e) => {
      this.connected = false;
      this.ws = null;
      // 4401: not signed in. Don't hammer the server.
      if (this.users > 0 && e.code !== 4401) {
        const delay = Math.min(10_000, 500 * 2 ** this.retry++);
        this.timer = setTimeout(() => this.open(), delay);
      }
    };
  }

  private shutdown() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  send(m: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
    else this.outbox.push(m);
  }

  listen(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Run now if connected, and again after every reconnect. */
  onOpen(f: () => void): () => void {
    this.openers.add(f);
    if (this.connected) f();
    return () => this.openers.delete(f);
  }
}

export const socket = new Socket();
