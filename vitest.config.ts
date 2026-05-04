import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@server": path.resolve(__dirname, "server"),
    },
  },
  test: {
    include: [
      "shared/**/*.test.ts",
      "server/**/*.test.ts",
      "client/src/**/*.test.{ts,tsx}",
    ],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    environment: "jsdom",
    globals: false,
  },
});
