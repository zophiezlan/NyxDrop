import type { Express } from "express";
import express from "express";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

export async function setupVite(app: Express, server: Server): Promise<void> {
  // Lazily import vite so production bundles do not pull it in.
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    // Explicitly point at vite.config.ts at the repo root. Without this Vite
    // searches inside `root` (= ./client) and silently misses our path
    // aliases, and imports like `@/hooks/...` fail to resolve at dev-time.
    configFile: path.resolve(repoRoot, "vite.config.ts"),
    appType: "custom",
    server: {
      middlewareMode: true,
      hmr: { server },
    },
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    if (req.originalUrl.startsWith("/api/")) {
      next();
      return;
    }
    try {
      const indexPath = path.resolve(repoRoot, "client", "index.html");
      let template = await fs.readFile(indexPath, "utf-8");
      template = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });

  logger.info("vite middleware mounted (dev)");
}

export function serveStatic(app: Express): void {
  const staticDir = path.resolve(repoRoot, "dist", "public");
  app.use(express.static(staticDir, { index: false, maxAge: "1h" }));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });

  logger.info({ staticDir }, "static middleware mounted (prod)");
}
