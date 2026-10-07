// Pirate Cribbage service worker: makes the app installable and lets guest games vs Cap'n Bot
// work offline. The API and the game socket always go to the network.
// v4 drops caches that could hold a page saved under an image's name (see below).
const VERSION = "v4";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(["/", "/manifest.webmanifest", "/favicon.png", "/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = [SHELL, ASSETS];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache the API (accounts, stats, games) or the socket.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  // Pages: try the network for the latest version, fall back to the cached app when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(SHELL).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // Built files have content hashes in their names, so a cached copy is always correct, as long
  // as only the real file is kept: never an error, and never a page (an older server mid-update
  // answers a file it doesn't have with the app's page).
  if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            const page = (res.headers.get("content-type") ?? "").includes("text/html");
            if (res.ok && !page) {
              const copy = res.clone();
              void caches.open(ASSETS).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
