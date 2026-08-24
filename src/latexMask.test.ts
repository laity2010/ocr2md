import * as assert from "assert";
import {
  maskLatexForTranslation,
  missingLatexTokens,
  restoreLatexAfterTranslation,
} from "./latexMask";

const inline = maskLatexForTranslation("The value is $r_f + \\beta(R_m-r_f)$. It rises.");
assert.strictEqual(inline.text, "The value is __OCR2MD_LATEX_0001__. It rises.");
assert.deepStrictEqual(inline.replacements, [
  { token: "__OCR2MD_LATEX_0001__", latex: "$r_f + \\beta(R_m-r_f)$" },
]);
assert.strictEqual(
  restoreLatexAfterTranslation("该值为 __OCR2MD_LATEX_0001__。它会上升。", inline.replacements),
  "该值为 $r_f + \\beta(R_m-r_f)$。它会上升。",
);

const mixed = maskLatexForTranslation([
  "Inline $x^2$ and display $$y = \\frac{1}{2}$$,",
  "plus \\(z+1\\) and \\[w=3\\].",
].join("\n"));
assert.strictEqual(mixed.replacements.length, 4);
assert.deepStrictEqual(mixed.replacements.map((item) => item.latex), [
  "$x^2$",
  "$$y = \\frac{1}{2}$$",
  "\\(z+1\\)",
  "\\[w=3\\]",
]);
const restoredMixed = restoreLatexAfterTranslation(mixed.text, mixed.replacements);
assert.strictEqual(restoredMixed, [
  "Inline $x^2$ and display $$y = \\frac{1}{2}$$,",
  "plus \\(z+1\\) and \\[w=3\\].",
].join("\n"));

const escaped = maskLatexForTranslation("A price is \\$5, but math is $x+1$.");
assert.strictEqual(escaped.text, "A price is \\$5, but math is __OCR2MD_LATEX_0001__.");
assert.deepStrictEqual(escaped.replacements.map((item) => item.latex), ["$x+1$"]);

const unmatched = maskLatexForTranslation("Keep unmatched $x + 1 as text.");
assert.strictEqual(unmatched.text, "Keep unmatched $x + 1 as text.");
assert.deepStrictEqual(unmatched.replacements, []);

const missing = missingLatexTokens("翻译只保留 __OCR2MD_LATEX_0001__", [
  { token: "__OCR2MD_LATEX_0001__", latex: "$x$" },
  { token: "__OCR2MD_LATEX_0002__", latex: "$y$" },
]);
assert.deepStrictEqual(missing, ["__OCR2MD_LATEX_0002__"]);

console.log("latexMask tests passed");
