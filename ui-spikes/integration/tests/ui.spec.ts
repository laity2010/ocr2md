import { test } from "@playwright/test";
import { executableUiContracts } from "./uic/catalog";
import { runUiInteractionContract } from "./uic/runner";

for (const contract of executableUiContracts) {
  test(`${contract.id} · ${contract.title}`, async ({ page }) => {
    await runUiInteractionContract(page, contract);
  });
}
