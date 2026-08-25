import * as https from "https";

export const DEFAULT_TRANSLATION_SAMPLE = "The company reported stronger earnings this quarter.";

export interface TranslationServiceTestResult {
  ok: boolean;
  statusCode?: number;
  message: string;
  translatedText?: string;
  rawResponse?: string;
}

export function deepLApiHost(apiKey: string): string {
  return apiKey.trim().endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
}

export function buildDeepLRequestBody(text: string, context?: string): string {
  const payload: { text: string[]; target_lang: "ZH-HANS"; context?: string } = {
    text: [text],
    target_lang: "ZH-HANS",
  };
  if (context?.trim()) payload.context = context;
  return JSON.stringify(payload);
}

export function parseDeepLResponse(statusCode: number, rawResponse: string): TranslationServiceTestResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    parsed = undefined;
  }
  const translatedText = extractDeepLTranslation(parsed);
  if (statusCode >= 200 && statusCode < 300 && translatedText) {
    return {
      ok: true,
      statusCode,
      message: "DeepL 测试成功。",
      translatedText,
      rawResponse,
    };
  }
  return {
    ok: false,
    statusCode,
    message: deepLErrorMessage(parsed) ?? `DeepL 返回 HTTP ${statusCode}。`,
    rawResponse,
  };
}

export async function translateDeepL(
  apiKey: string,
  text: string,
  context?: string,
): Promise<TranslationServiceTestResult> {
  const key = apiKey.trim();
  const source = text.trim();
  if (!key) return { ok: false, message: "请先填写 DeepL API Key。" };
  if (!source) return { ok: false, message: "没有可翻译的文本。" };
  return requestDeepL(key, buildDeepLRequestBody(source, context));
}

export async function testDeepL(apiKey: string, sampleText: string): Promise<TranslationServiceTestResult> {
  const text = sampleText.trim();
  if (!text) return { ok: false, message: "请输入测试样本句子。" };
  return translateDeepL(apiKey, text);
}

function requestDeepL(apiKey: string, body: string): Promise<TranslationServiceTestResult> {
  return new Promise((resolve) => {
    const request = https.request({
      hostname: deepLApiHost(apiKey),
      path: "/v2/translate",
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 15_000,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const rawResponse = Buffer.concat(chunks).toString("utf8");
        resolve(parseDeepLResponse(response.statusCode ?? 0, rawResponse));
      });
    });
    request.on("timeout", () => request.destroy(new Error("请求超时（15 秒）。")));
    request.on("error", (error) => resolve({
      ok: false,
      message: `DeepL 请求失败：${error.message}`,
    }));
    request.write(body);
    request.end();
  });
}

function extractDeepLTranslation(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const translations = (value as { translations?: unknown }).translations;
  if (!Array.isArray(translations) || !translations.length) return undefined;
  const text = (translations[0] as { text?: unknown })?.text;
  return typeof text === "string" ? text : undefined;
}

function deepLErrorMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : undefined;
}
