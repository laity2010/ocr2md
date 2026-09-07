import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const ids = new Set();
for (const match of app.matchAll(/requireElement(?:<[^>]+>)?\("([^"]+)"\)/g)) {
  ids.add(match[1]);
}

const missing = [...ids].filter((id) => !html.includes(`id="${id}"`));
if (missing.length) {
  throw new Error("DOM contract missing ids: " + missing.join(", "));
}
if (!html.includes('data-ocr2md-main')) {
  throw new Error("DOM contract missing main module marker");
}
if (!html.includes('html_bootstrap')) {
  throw new Error("DOM contract missing bootstrap probe");
}

console.log(`V2_DOM_CONTRACT_OK ids=${ids.size} bootstrap=present`);
