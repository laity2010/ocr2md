import * as assert from "assert";
import { buildDeepLRequestBody, deepLApiHost, parseDeepLResponse } from "./translationService";

assert.strictEqual(deepLApiHost("abc:fx"), "api-free.deepl.com");
assert.strictEqual(deepLApiHost("abc"), "api.deepl.com");

assert.strictEqual(
  buildDeepLRequestBody("Sentence one.", "Sentence one. Sentence two."),
  JSON.stringify({ text: ["Sentence one."], target_lang: "ZH-HANS", context: "Sentence one. Sentence two." }),
);
assert.strictEqual(
  buildDeepLRequestBody("Sentence one."),
  JSON.stringify({ text: ["Sentence one."], target_lang: "ZH-HANS" }),
);

const xmlProtected = 'Value <ocr2md-protected id="p0001"/> remains protected.';
assert.strictEqual(
  buildDeepLRequestBody(xmlProtected, "Value context."),
  JSON.stringify({
    text: [xmlProtected],
    target_lang: "ZH-HANS",
    context: "Value context.",
    tag_handling: "xml",
    tag_handling_version: "v2",
    outline_detection: false,
    split_sentences: "0",
    non_splitting_tags: ["ocr2md-protected"],
    ignore_tags: ["ocr2md-protected"],
  }),
  "protected Markdown requests must use DeepL XML tag handling so placeholders cannot be translated away",
);

assert.deepStrictEqual(
  parseDeepLResponse(200, JSON.stringify({ translations: [{ text: "本季度公司盈利更为强劲。" }] })),
  {
    ok: true,
    statusCode: 200,
    message: "DeepL 测试成功。",
    translatedText: "本季度公司盈利更为强劲。",
    rawResponse: JSON.stringify({ translations: [{ text: "本季度公司盈利更为强劲。" }] }),
  },
);

assert.deepStrictEqual(
  parseDeepLResponse(403, JSON.stringify({ message: "Authorization failed" })),
  {
    ok: false,
    statusCode: 403,
    message: "Authorization failed",
    rawResponse: JSON.stringify({ message: "Authorization failed" }),
  },
);

assert.deepStrictEqual(
  parseDeepLResponse(500, "not-json"),
  {
    ok: false,
    statusCode: 500,
    message: "DeepL 返回 HTTP 500。",
    rawResponse: "not-json",
  },
);

console.log("translationService tests passed");

import { buildOpenAIRequestBody, parseOpenAIResponse } from "./translationService";
const openAIBody = JSON.parse(buildOpenAIRequestBody("Sentence one.", "Paragraph context.", "gpt-test", "Translate only."));
assert.strictEqual(openAIBody.model, "gpt-test");
assert.strictEqual(openAIBody.instructions, "Translate only.");
assert.ok(openAIBody.input.includes("Paragraph context."));
assert.ok(openAIBody.input.endsWith("Sentence one."));
assert.strictEqual(openAIBody.store, false);
assert.deepStrictEqual(
  parseOpenAIResponse(200, JSON.stringify({ output_text: "第一句。" })),
  { ok: true, statusCode: 200, message: "OpenAI GPT 测试成功。", translatedText: "第一句。", rawResponse: JSON.stringify({ output_text: "第一句。" }) },
);
assert.strictEqual(
  parseOpenAIResponse(200, JSON.stringify({ output: [{ content: [{ type: "output_text", text: "第二句。" }] }] })).translatedText,
  "第二句。",
);
assert.strictEqual(parseOpenAIResponse(401, JSON.stringify({ error: { message: "bad key" } })).message, "bad key");
