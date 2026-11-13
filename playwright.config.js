import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...devices["Pixel 5"],
    locale: "es-PE",
    timezoneId: "America/Lima",
    trace: "on-first-retry",
  },
  webServer: {
    command: "node tests/local-server.mjs",
    url: "http://127.0.0.1:4173/login",
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
