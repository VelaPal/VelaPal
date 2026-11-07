import { defineConfig } from "@playwright/test";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const webPort = new URL(baseURL).port || "3000";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    actionTimeout: 15000,
    baseURL,
    channel:
      process.env.PLAYWRIGHT_CHANNEL ||
      (process.platform === "win32" ? "msedge" : undefined),
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run start -- --port ${webPort}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_API_MODE: "mock",
      MOCK_ALLOWED_ORIGINS: `${baseURL},http://127.0.0.1:${webPort},http://[::1]:${webPort}`,
    },
  },
});
