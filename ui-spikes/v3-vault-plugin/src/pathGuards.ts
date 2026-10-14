/** Obsidian vault paths are relative to the current active vault. */
export const EXPECTED_VAULT = "ocr2md";
export const WORK_AREA = "ocr2md";
export const TEST_FILE_PREFIX = "_wp2_vault_probe_";

export function isTargetVault(name: string): boolean {
  return name === EXPECTED_VAULT;
}
export function isProtectedPath(path: string, configDir = ".obsidian"): boolean {
  const first = path.split("/")[0];
  return first === configDir || first.startsWith(".");
}
export function testNotePath(timestamp: number): string {
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) throw new Error("Invalid timestamp");
  return `${WORK_AREA}/${TEST_FILE_PREFIX}${timestamp}.md`;
}
