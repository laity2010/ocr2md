import * as assert from "assert";
import { scanTranslationUnits } from "./translationUnits";

const markdown = [
  "---",
  "ocr2md_format_calibrated: true",
  "---",
  "",
  "Ordinary one. Ordinary two.",
  "<br>",
  ">",
  "Figure 2. How Berkshire Stacks Up",
  "![[imgs/example.jpg]]",
  ">",
  "Notes: This figure shows the distribution...",
  ">>[! ]- HTML",
  ">><table><tr><td>A</td></tr></table>",
  "><embed id=01></embed>",
  "<br>",
  "$$",
  "E = mc^2",
  "$$",
  "<br>",
  "After formula.",
].join("\n");

const units = scanTranslationUnits(markdown, "/ws/chapters/02/trans/02.md");
assert.deepStrictEqual(
  units.map((unit) => [unit.translationUnitKind, unit.raw]),
  [
    ["sentence", "Ordinary one."],
    ["sentence", "Ordinary two."],
    ["composite", "Figure 2. How Berkshire Stacks Up"],
    ["composite", "Notes: This figure shows the distribution..."],
    ["sentence", "After formula."],
  ],
);
assert.ok(units.every((unit) => !unit.raw.includes("imgs/example.jpg")));
assert.ok(units.every((unit) => !unit.raw.includes("<table")));
assert.ok(units.every((unit) => !unit.raw.includes("E = mc^2")));
assert.strictEqual(units[2].parentBlockIndex, 2);
assert.strictEqual(units[2].sentenceIndex, 1);
assert.strictEqual(units[3].sentenceIndex, 2);

console.log("translationUnits tests passed");
