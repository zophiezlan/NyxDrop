import type { RequestHandler } from "express";

const isProd = process.env.NODE_ENV === "production";

// Production CSP — strict.
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // 'unsafe-inline' for styles is required by Leaflet's inline style attributes
  // on map elements (popups, marker positioning). Tailwind compiles to a
  // static CSS file and does NOT need this. See decisions.md D-008.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.tile.openstreetmap.org",
  "connect-src 'self'",
  "manifest-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Dev CSP — Vite's HMR preamble is an inline module script and its WebSocket
// runs over ws:// during local dev. We loosen exactly those two directives;
// every other directive remains identical to prod.
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.tile.openstreetmap.org",
  "connect-src 'self' ws://localhost:* http://localhost:*",
  "manifest-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(self), microphone=(self)");
  res.setHeader("Content-Security-Policy", isProd ? PROD_CSP : DEV_CSP);
  next();
};
