import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Optional integration tests against the real providers.
 * Run with `npm run test:integration`; never part of `npm test`.
 * Each test skips itself when the network or the required key is missing.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.int.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
