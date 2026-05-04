import "dotenv/config";
import express from "express";
import { securityHeaders } from "../server/lib/security-headers.js";
import { registerRoutes } from "../server/routes/index.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(securityHeaders);
app.use(express.json({ limit: "100kb" }));
registerRoutes(app);

export default app;
