import assert from "node:assert/strict";
import { configurationValuePreview } from "../src/tableConfigurationGrid";

assert.equal(configurationValuePreview(true), "true");
assert.equal(configurationValuePreview(false), "false");
assert.equal(configurationValuePreview(42), "42");
assert.equal(configurationValuePreview("abc"), '"abc"');
assert.equal(
  configurationValuePreview({ width: 82, pinned: "left" }),
  '{"width":82,"pinned":"left"}',
);

const longArray = [
  "0123456789",
  "abcdefghij",
  "ABCDEFGHIJ",
  "甲乙丙丁戊己庚辛壬癸",
  "last",
];
const preview = configurationValuePreview(longArray);
assert.equal(preview.length, 50);
assert.equal(preview.endsWith("…"), true);
assert.equal(
  preview,
  JSON.stringify(longArray).slice(0, 49) + "…",
);

console.log("table configuration value preview: PASS");
