import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "@fontsource/alegreya-sans/latin-400.css";
import "@fontsource/alegreya-sans/latin-500.css";
import "@fontsource/alegreya-sans/latin-700.css";
import "@fontsource/alegreya-sans/latin-800.css";
import "@fontsource/pirata-one/latin-400.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installable app + offline play vs the bot. Only in production builds, so development always
// loads fresh code.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
