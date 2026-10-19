import { readdirSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// The backend harness (prepix-backend scripts/workspaces-preview.cjs) has two
// modes no single flag set covers, so every spec names the one it runs against
// (`--project <mode>`; CI starts one harness per mode, see .github/workflows/ci.yml):
//   default    B2B_TEST_ENABLED, B2B_TEST_LAUNCH_DEFAULTS, files, previews, storage
//   new-teams  default + B2B_TEST_NEW_TEAMS, billing (PG double), orders,
//              statements, devices, notifications
// Specs that mount a component or fake the transport need no harness and sit in
// default, the shorter job.
const modes: Record<string, string[]> = {
  default: [
    "api-session-mutations", "api-session-races", "archive-preview", "b2b-home-races",
    "b2b-project-list-races", "b2b-projects", "b2b-review-exact-target", "b2b-statements-races",
    "payment-receipts", "plan-switch", "upload-queue", "verify-email", "workspace-kinds", "workspace-onboarding",
  ],
  "new-teams": [
    "b2b-audience", "b2b-billing", "b2b-files", "b2b-home", "b2b-legal-floor", "b2b-licences",
    "b2b-notifications", "b2b-plan", "b2b-review-layout", "b2b-reviews", "b2b-statements",
    "b2b-team-creation", "b2b-team-lifecycle", "b2b-team-usage", "b2b-team-visibility",
    "b2b-team-visibility-external", "b2b-viewer", "onboarding-first-run", "t-verify-gaps",
  ],
};
// Dates on screen are the viewer's local ones and specs compute the expected
// text in Node, so browser and test process both run in KST, as the people the
// suite was written by (and for) do. CI runners are UTC.
process.env.TZ = "Asia/Seoul";

const listed = Object.values(modes).flat();
const unlisted = readdirSync(`${__dirname}/e2e`)
  .filter((f) => f.endsWith(".spec.ts"))
  .map((f) => f.replace(/\.spec\.ts$/, ""))
  .filter((f) => !listed.includes(f));
if (unlisted.length)
  throw new Error(`Give these specs a harness mode in playwright.config.ts: ${unlisted.join(", ")}`);

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.B2B_E2E_WEB_URL ?? "http://localhost:3001",
    channel: "chrome",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1360, height: 1100 },
    actionTimeout: 10_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: Object.entries(modes).map(([name, specs]) => ({
    name,
    testMatch: specs.map((s) => `**/${s}.spec.ts`),
  })),
});
