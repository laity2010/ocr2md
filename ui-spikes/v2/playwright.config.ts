import { defineConfig, devices } from "@playwright/test";

const testPort = process.env.OCR2MD_V2_TEST_PORT ?? "4281";
const testProjectDir =
  process.env.OCR2MD_V2_TEST_PROJECT_DIR ?? ".tmp/persistent-project";
const testBaseUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/workspaceMachine.test.ts"],
  outputDir: "/tmp/ocr2md-v2-playwright-results",
  preserveOutput: "failures-only",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  webServer: {
    command:
      `python3 prepare_test_workspace.py --project-dir ${testProjectDir} && `
      + `python3 dev_server.py --port ${testPort} --bind 127.0.0.1 --project-dir ${testProjectDir} --workspace-root .tmp --config-dir .tmp/private-config`,
    url: testBaseUrl,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    baseURL: testBaseUrl,
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "ipad-chrome",
      use: {
        ...devices["iPad Pro 11"],
        browserName: "chromium",
        channel: "chrome",
      },
    },
  ],
});
