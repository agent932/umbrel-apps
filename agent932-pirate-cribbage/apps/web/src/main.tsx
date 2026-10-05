import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { StatusBar } from "@capacitor/status-bar";
import { isNativeApp } from "./native.js";
import { installNavigation } from "./navigation.js";
import "@fontsource/alegreya-sans/latin-400.css";
import "@fontsource/alegreya-sans/latin-500.css";
import "@fontsource/alegreya-sans/latin-700.css";
import "@fontsource/alegreya-sans/latin-800.css";
import "@fontsource/pirata-one/latin-400.css";
import "./index.css";

// Before the router subscribes, so screen transitions hear every navigation first.
installNavigation();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installable app + offline play vs the bot. Only in production builds, so development always
// loads fresh code.
if (import.meta.env.PROD && !isNativeApp && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

// The app is a full-screen game: no clock or battery bar over the table.
if (isNativeApp) void StatusBar.hide().catch(() => {});
