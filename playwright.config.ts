import { defineConfig, devices } from "@playwright/test";

const PORT = 4319;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  // One retry in CI absorbs a flaky browser start; a real mismatch fails twice.
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    // A tablet: WebKit with touch, at iPad size. Only the specs about touch-sized controls.
    { name: "ipad", use: { ...devices["iPad Pro 11"] }, testMatch: ["vary.spec.ts", "mobile.spec.ts"] },
  ],
  // Serves the production build; run `pnpm build` first (the e2e script does).
  webServer: {
    command: `pnpm --filter @tramaloom/studio exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/check.html`,
    // Never reuse: a stale preview of an old build would make the check pass on old code.
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
