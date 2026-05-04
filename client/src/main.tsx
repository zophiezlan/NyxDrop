import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles/globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in document");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the service worker — required for Web Push (Phase 4) and PWA
// install (Phase 8). Wait until after first paint so registration doesn't
// compete with the initial render.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Failure is non-fatal: the app works without push or offline caching.
      console.warn("[sw] registration failed", err);
    });
  });
}
