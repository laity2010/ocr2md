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
