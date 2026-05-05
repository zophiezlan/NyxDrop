import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { registerServiceWorker } from "./lib/sw-register.js";
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
// install (Phase 8). Skip in dev because the SW would intercept Vite's HMR
// asset URLs; tests against the SW use `vite build && vite preview` (or a
// production deploy).
if (import.meta.env.PROD) {
  registerServiceWorker();
} else if ("serviceWorker" in navigator) {
  // In dev: actively unregister any SW left over from a previous session
  // (or a previous build) so it doesn't shadow Vite's dev assets.
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}
