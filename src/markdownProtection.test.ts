import * as assert from "assert";
import {
  containsProtectionPlaceholder,
  markdownStructureIssue,
  missingProtectedMarkdownTokens,
  protectMarkdownForTranslation,
  restoreProtectedMarkdown,
} from "./markdownProtection";

const source = [
  "## Revenue $R_t$ and [^1]",
  "1. See [[Notes#Section]] and ![[imgs/chart.png]].",
  "Visit https://example.com/a?q=1 and use `x += 1`.",
  "[^1]: Keep <sup>HTML</sup> and [source](https://example.com).",
].join("\n");
const protectedText = protectMarkdownForTranslation(source);
assert.ok(protectedText.replacements.length >= 10, "all structural/protected constructs should be masked");
assert.ok(!protectedText.text.includes("$R_t$"));
assert.ok(!protectedText.text.includes("[[Notes#Section]]"));
assert.ok(!protectedText.text.includes("https://example.com/a?q=1"));
assert.ok(!protectedText.text.includes("`x += 1`"));
assert.deepStrictEqual(missingProtectedMarkdownTokens(protectedText.text, protectedText.replacements), []);
assert.strictEqual(restoreProtectedMarkdown(protectedText.text, protectedText.replacements), source);
assert.ok(containsProtectionPlaceholder(protectedText.text));
assert.ok(!containsProtectionPlaceholder(source));

const nested = "    - Nested item.\n>> Quoted text.";
const nestedProtected = protectMarkdownForTranslation(nested);
assert.strictEqual(restoreProtectedMarkdown(nestedProtected.text, nestedProtected.replacements), nested);
assert.ok(nestedProtected.replacements.some((item) => item.value === "    - "));
assert.ok(nestedProtected.replacements.some((item) => item.value === ">> "));


const link = protectMarkdownForTranslation("Read [the source](https://example.com/doc) now.");
assert.ok(link.text.includes("the source"), "Markdown link label should remain translatable");
assert.ok(!link.text.includes("https://example.com/doc"), "Markdown link destination must be protected");
const simulatedLinkTranslation = link.text.replace("the source", "资料来源");
assert.strictEqual(
  restoreProtectedMarkdown(simulatedLinkTranslation, link.replacements),
  "Read [资料来源](https://example.com/doc) now.",
);

const damaged = protectedText.text.replace(protectedText.replacements[0].token, "");
assert.deepStrictEqual(missingProtectedMarkdownTokens(damaged, protectedText.replacements), [protectedText.replacements[0].token]);

assert.strictEqual(
  markdownStructureIssue("[^3]: Footnote body.", "[^3]: 脚注正文。"),
  undefined,
);
assert.match(
  markdownStructureIssue("[^3]: Footnote body.", "[^3]：脚注正文。") || "",
  /\[\^3\]:/,
  "legacy translation that changed the footnote-definition colon must be rejected",
);
assert.strictEqual(
  markdownStructureIssue(
    "Read [the source](https://example.com/doc).",
    "阅读[资料来源](https://example.com/doc)。",
  ),
  undefined,
  "translated Markdown link label may change while its structure/destination stays intact",
);

console.log("markdownProtection tests passed");
