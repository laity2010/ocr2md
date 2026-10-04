import { expect, test } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const projectDir = path.resolve(
  process.env.OCR2MD_V2_TEST_PROJECT_DIR ?? ".tmp/persistent-project",
);
const workspaceRoot = path.resolve(".tmp");
const alternateName = "workspace-switch-target";
const alternateDir = path.join(workspaceRoot, alternateName);

async function openDirectoryBrowser(page: import("@playwright/test").Page) {
  await page.locator("#workspace-directory-button").click();
  await expect(page.locator("#workspace-directory-overlay")).toBeVisible();
}

test("top navigation browses workspace root and switches clean working directories", async ({ page, request }) => {
  test.setTimeout(60_000);
  await rm(alternateDir, { recursive: true, force: true });
  await mkdir(alternateDir, { recursive: true });
  await writeFile(path.join(alternateDir, "notes.md"), "# Temporary workspace\n", "utf8");

  try {
    const initial = await request.get("/__workspace/directories?path=").then((response) => response.json() as Promise<{
      currentProjectPath: string;
      currentProjectDisplayPath: string;
      directories: Array<{ name: string; path: string }>;
    }>);
    expect(initial.currentProjectPath).toBe(path.basename(projectDir));
    expect(initial.currentProjectDisplayPath).toBe(`/data/${path.basename(projectDir)}`);
    expect(initial.directories.some((item) => item.name === alternateName)).toBe(true);

    await page.goto("/");
    await expect(page.locator("#state-value")).toHaveText("idle");
    await expect(page.locator("#workspace-directory-button"))
      .toContainText(`/data/${path.basename(projectDir)}`);

    await openDirectoryBrowser(page);
    await page.locator("#workspace-directory-breadcrumb button", { hasText: "/data" }).click();
    await expect(page.locator("#workspace-directory-path")).toHaveText("/data");
    const alternate = page.locator("#workspace-directory-list .workspace-directory-entry", {
      hasText: alternateName,
    });
    await expect(alternate).toBeVisible();
    await alternate.click();
    await expect(page.locator("#workspace-directory-path")).toHaveText(`/data/${alternateName}`);
    await page.locator("#workspace-directory-select").click();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("#state-value")).toHaveText("idle");
    await expect(page.locator("#workspace-directory-button"))
      .toContainText(`/data/${alternateName}`);
    await expect(page.locator("#project-name")).toHaveText(alternateName);
    await expect(page.locator("#chapter-selection-status")).toContainText("chapters 0/0");

    // Switching to an ordinary directory is read-only until the user performs
    // a real project action. Browsing/switching must not manufacture chapters.
    await expect.poll(async () => {
      const { readdir } = await import("node:fs/promises");
      return (await readdir(alternateDir)).sort();
    }).toEqual(["notes.md"]);

    await openDirectoryBrowser(page);
    await page.locator("#workspace-directory-breadcrumb button", { hasText: "/data" }).click();
    const originalLabel = page.getByText(`📁 ${path.basename(projectDir)}`, { exact: true });
    await expect(originalLabel).toBeVisible();
    await originalLabel.locator("xpath=ancestor::button[1]").click();
    await page.locator("#workspace-directory-select").click();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("#state-value")).toHaveText("idle");
    await expect(page.locator("#project-name")).toHaveText(path.basename(projectDir));
    expect(await page.locator("#chapter-select option").count()).toBeGreaterThan(3);
    await expect(page.locator("#chapter-select")).toContainText("chapters/");
  } finally {
    // Best effort restore if an assertion failed after the alternate switch.
    await request.post("/__workspace/project-directory", {
      data: { path: path.basename(projectDir) },
    }).catch(() => undefined);
    await rm(alternateDir, { recursive: true, force: true });
  }
});
