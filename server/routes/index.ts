import type { Express, NextFunction, Request, Response } from "express";
import locationsRouter from "./locations.js";
import { logger } from "../lib/logger.js";

export function registerRoutes(app: Express): void {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.use(locationsRouter);

  // 404 for unmatched /api routes — anything else falls through to the SPA.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
  });

  // Centralised error handler for API routes. Express recognises this by the
  // 4-arity signature; do not remove `_next` even though it appears unused.
  app.use(
    "/api",
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      logger.error({ err }, "unhandled API error");
      res.status(500).json({ error: "Server error", code: "SERVER_ERROR" });
    },
  );
}
