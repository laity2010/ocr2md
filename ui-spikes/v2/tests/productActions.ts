import { expect, type Page } from "@playwright/test";

export async function closeChapter(page: Page): Promise<void> {
  const clientId = await page.evaluate(() =>
    window.localStorage.getItem("ocr2md-v2-debug-client-id"));
  expect(clientId).toBeTruthy();

  const request = page.context().request;
  const response = await request.post("/__debug/command", {
    data: { clientId, action: "close" },
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json() as {
    command?: { commandId?: string };
  };
  const commandId = payload.command?.commandId;
  expect(commandId).toBeTruthy();

  await expect.poll(async () => {
    const ackResponse = await request.get(
      `/__debug/ack?clientId=${encodeURIComponent(clientId!)}`,
    );
    if (!ackResponse.ok()) return undefined;
    const ackPayload = await ackResponse.json() as {
      ack?: { commandId?: string } | null;
    };
    return ackPayload.ack?.commandId;
  }, { timeout: 10_000 }).toBe(commandId);
}
