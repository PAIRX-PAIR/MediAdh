import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the production build with the in-memory demo data.
 * Locally they use the installed Google Chrome (no browser download); in CI the
 * bundled Chromium. The demo store lives in one server process, so tests run serially.
 */
const PORT = 3200;
const useSystemChrome = !process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], ...(useSystemChrome ? { channel: "chrome" } : {}) }, testIgnore: /operario.spec.ts/ },
    {
      name: "celular",
      use: { ...devices["Pixel 7"], ...(useSystemChrome ? { channel: "chrome" } : {}) },
      testMatch: /operario\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/public`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      DATA_BACKEND: "memory",
      DEMO_SEED: "on",
      SESSION_SECRET: "e2e-only-session-secret-not-for-production-0123456789",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
