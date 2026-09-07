import { defineConfig, devices } from "@playwright/test";

const useWebKit = process.env.OCR2MD_UI_WEBKIT === "1";
const testPort = process.env.OCR2MD_UI_TEST_PORT ?? "4276";
const testBaseUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./tests",
  outputDir: "/tmp/ocr2md-playwright-results",
  preserveOutput: "failures-only",
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  reporter: [["list"]],
  webServer: {
    command: `npm run build && OCR2MD_UI_SERVE_PORT=${testPort} npm run serve`,
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
    useWebKit
      ? {
          name: "ipad-webkit",
          use: {
            ...devices["iPad Pro 11"],
          },
        }
      : {
          name: "ipad-chrome",
          use: {
            ...devices["iPad Pro 11"],
            browserName: "chromium",
            channel: "chrome",
          },
        },
  ],
});
