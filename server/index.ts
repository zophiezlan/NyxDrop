import "dotenv/config";

import express from "express";
import { registerRoutes } from "./routes/index.js";
import { securityHeaders } from "./lib/security-headers.js";
import { setupVite, serveStatic } from "./lib/vite.js";
import { logger } from "./lib/logger.js";
import { startWeightDecayScheduler } from "./jobs/decay-weights.js";
import { initialisePush } from "./lib/push.js";

const isProd = process.env.NODE_ENV === "production";
const port = Number.parseInt(process.env.PORT ?? "5000", 10);

async function main(): Promise<void> {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(securityHeaders);
  app.use(express.json({ limit: "100kb" }));

  registerRoutes(app);

  const server = app.listen(port, "0.0.0.0", () => {
    logger.info({ port, env: process.env.NODE_ENV ?? "development" }, "server listening");
  });

  if (isProd) {
    serveStatic(app);
  } else {
    await setupVite(app, server);
  }

  startWeightDecayScheduler();
  initialisePush();
}

main().catch((err: unknown) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
