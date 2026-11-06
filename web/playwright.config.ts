import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 90000,
  testMatch: "**/*.e2e.spec.ts",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3107", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 3107",
    url: "http://localhost:3107",
    reuseExistingServer: false,
  },
  reporter: "list",
});
