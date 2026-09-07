import { expect, test } from "@playwright/test";

test("dev state channel reports project catalog, selection, and opened chapter", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");

  const clientId = await page.evaluate(() =>
    window.localStorage.getItem("ocr2md-v2-debug-client-id"));
  expect(clientId).toBeTruthy();

  const refreshDisplay = (await page.locator("#page-loaded-at").textContent())?.trim();
  expect(refreshDisplay).toBeTruthy();
  expect(refreshDisplay).not.toBe("—");

  await page.locator("#chapter-select").selectOption({ label: "chapters/01 Buffett’s Alpha" });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  await expect.poll(async () => {
    return page.evaluate(async (id) => {
      const response = await fetch("/__debug/state", { cache: "no-store" });
      const payload = await response.json() as {
        clients: Array<{
          clientId: string;
          lastAction?: string;
          sequence?: number;
          pageLoadedAt?: string;
          state?: {
            session?: string;
            projectName?: string;
            chapterCount?: number;
            readyChapterCount?: number;
            selectedChapterId?: string;
            workingLines?: number;
            calibrationRows?: number;
            visibleCalibrationRows?: number;
            ignoredCalibrationRows?: number;
            headingNumberingEnabled?: boolean;
            titleHeadingCount?: number;
            titleExportHeadingCount?: number;
            titleExportNumberedCount?: number;
            canSetHeadingNumbering?: boolean;
            illegalMergeDecisionCount?: number;
            illegalMergeSpanCount?: number;
            ignoredIllegalLineBreakRows?: number;
            annotationPairs?: number;
            canOpenChapter?: boolean;
            canEdit?: boolean;
            canSave?: boolean;
          };
        }>;
      };
      const client = payload.clients.find((item) => item.clientId === id);
      return client ? {
        lastAction: client.lastAction,
        sequenceAdvanced: (client.sequence ?? 0) >= 4,
        pageLoadedAtValid: Number.isFinite(Date.parse(client.pageLoadedAt ?? "")),
        session: client.state?.session,
        projectName: client.state?.projectName,
        chapterCount: client.state?.chapterCount,
        readyChapterCount: client.state?.readyChapterCount,
        selectedChapterIdPresent: Boolean(client.state?.selectedChapterId),
        workingLines: client.state?.workingLines,
        calibrationRows: client.state?.calibrationRows,
        visibleCalibrationRows: client.state?.visibleCalibrationRows,
        ignoredCalibrationRows: client.state?.ignoredCalibrationRows,
        headingNumberingEnabled: client.state?.headingNumberingEnabled,
        titleHeadingCount: client.state?.titleHeadingCount,
        titleExportHeadingCount: client.state?.titleExportHeadingCount,
        titleExportNumberedCount: client.state?.titleExportNumberedCount,
        canSetHeadingNumbering: client.state?.canSetHeadingNumbering,
        illegalMergeDecisionCount: client.state?.illegalMergeDecisionCount,
        illegalMergeSpanCount: client.state?.illegalMergeSpanCount,
        ignoredIllegalLineBreakRows: client.state?.ignoredIllegalLineBreakRows,
        annotationPairs: client.state?.annotationPairs,
        canOpenChapter: client.state?.canOpenChapter,
        canEdit: client.state?.canEdit,
        canSave: client.state?.canSave,
      } : null;
    }, clientId);
  }).toEqual({
    lastAction: "open-chapter",
    sequenceAdvanced: true,
    pageLoadedAtValid: true,
    session: "chapter-clean",
    projectName: "persistent-project",
    chapterCount: 3,
    readyChapterCount: 2,
    selectedChapterIdPresent: true,
    workingLines: 382,
    calibrationRows: 205,
    visibleCalibrationRows: 186,
    ignoredCalibrationRows: 15,
    headingNumberingEnabled: true,
    titleHeadingCount: 10,
    titleExportHeadingCount: 10,
    titleExportNumberedCount: 10,
    canSetHeadingNumbering: true,
    illegalMergeDecisionCount: 6,
    illegalMergeSpanCount: 6,
    ignoredIllegalLineBreakRows: 3,
    annotationPairs: 10,
    canOpenChapter: false,
    canEdit: true,
    canSave: false,
  });
});


test("dev state channel rejects stale sequence from the same page instance", async ({ request }) => {
  const clientId = `ordering-${Date.now()}`;
  const firstPageLoadedAt = "2026-09-06T00:00:00.000Z";
  const secondPageLoadedAt = "2026-09-06T00:00:01.000Z";

  const newer = await request.post("/__debug/state", {
    data: {
      clientId,
      sequence: 2,
      pageLoadedAt: firstPageLoadedAt,
      state: { session: "newer" },
    },
  });
  expect(newer.ok()).toBe(true);
  expect((await newer.json() as { accepted: boolean }).accepted).toBe(true);

  const stale = await request.post("/__debug/state", {
    data: {
      clientId,
      sequence: 1,
      pageLoadedAt: firstPageLoadedAt,
      state: { session: "stale" },
    },
  });
  expect(stale.ok()).toBe(true);
  expect((await stale.json() as { accepted: boolean }).accepted).toBe(false);

  let response = await request.get("/__debug/state");
  let payload = await response.json() as {
    clients: Array<{
      clientId: string;
      sequence?: number;
      pageLoadedAt?: string;
      state?: { session?: string };
    }>;
  };
  let client = payload.clients.find((item) => item.clientId === clientId)!;
  expect(client.sequence).toBe(2);
  expect(client.state?.session).toBe("newer");

  const newPage = await request.post("/__debug/state", {
    data: {
      clientId,
      sequence: 1,
      pageLoadedAt: secondPageLoadedAt,
      state: { session: "new-page" },
    },
  });
  expect(newPage.ok()).toBe(true);
  expect((await newPage.json() as { accepted: boolean }).accepted).toBe(true);

  response = await request.get("/__debug/state");
  payload = await response.json() as typeof payload;
  client = payload.clients.find((item) => item.clientId === clientId)!;
  expect(client.sequence).toBe(1);
  expect(client.pageLoadedAt).toBe(secondPageLoadedAt);
  expect(client.state?.session).toBe("new-page");
});
