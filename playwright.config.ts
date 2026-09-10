import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// In some CI/sandbox images the Playwright browsers live in a pre-installed
// location whose build number does not match the pinned @playwright/test
// version. Fall back to that binary when it exists.
const preinstalledChromium = [
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].find((p) => fs.existsSync(p));

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...(preinstalledChromium && !process.env.PLAYWRIGHT_USE_BUNDLED
      ? { launchOptions: { executablePath: preinstalledChromium } }
      : {}),
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // E2E runs against a production build and the deterministic mock
    // providers, so that no external service (and no dev HMR socket) is
    // required. Set E2E_DEV=1 to target the dev server instead.
    command: process.env.E2E_DEV ? `npm run dev -- --port ${port}` : `npm run build && npx next start --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      ROUTING_PROVIDER: "mock",
      GEOCODING_PROVIDER: "mock",
      ELEVATION_PROVIDER: "mock",
      NEXT_PUBLIC_MAP_PROVIDER: "openfreemap",
      // Many generations in a row from one IP: do not trip the rate limiter.
      RATE_LIMIT_PER_MINUTE: "5000",
    },
  },
});
