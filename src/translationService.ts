import { MARKDOWN_PROTECTION_TAG, usesXmlProtectionPlaceholders } from "./markdownProtection";
import * as https from "https";

export const DEFAULT_TRANSLATION_SAMPLE = "The company reported stronger earnings this quarter.";
export const DEFAULT_OPENAI_MODEL = "gpt-5.4";
export const DEFAULT_OPENAI_TRANSLATION_PROMPT = [
  "Translate the requested text into natural Simplified Chinese.",
  "Return only the translated text, with no explanation or quotation marks.",
  "Preserve every <ocr2md-protected ...> XML placeholder exactly and do not translate, delete, duplicate, or reorder the content inside protected placeholders.",
  "Use the supplied context only to improve translation quality; do not include the context in the output.",
].join(" ");

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
  const payload: {
    text: string[];
    target_lang: "ZH-HANS";
    context?: string;
    tag_handling?: "xml";
    tag_handling_version?: "v2";
    outline_detection?: false;
    split_sentences?: "0";
    non_splitting_tags?: string[];
    ignore_tags?: string[];
  } = {
    text: [text],
    target_lang: "ZH-HANS",
  };
  if (context?.trim()) payload.context = context;
  if (usesXmlProtectionPlaceholders(text)) {
    payload.tag_handling = "xml";
    payload.tag_handling_version = "v2";
    payload.outline_detection = false;
    payload.split_sentences = "0";
    payload.non_splitting_tags = [MARKDOWN_PROTECTION_TAG];
    payload.ignore_tags = [MARKDOWN_PROTECTION_TAG];
  }
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

export function buildOpenAIRequestBody(
  text: string,
  context: string | undefined,
  model = DEFAULT_OPENAI_MODEL,
  prompt = DEFAULT_OPENAI_TRANSLATION_PROMPT,
): string {
  const input = context?.trim()
    ? `Context for meaning only (do not output):\n${context}\n\nText to translate:\n${text}`
    : `Text to translate:\n${text}`;
  return JSON.stringify({
    model: model.trim() || DEFAULT_OPENAI_MODEL,
    instructions: prompt.trim() || DEFAULT_OPENAI_TRANSLATION_PROMPT,
    input,
    store: false,
    text: { verbosity: "low" },
  });
}

export function parseOpenAIResponse(statusCode: number, rawResponse: string): TranslationServiceTestResult {
  let parsed: unknown;
  try { parsed = JSON.parse(rawResponse); } catch { parsed = undefined; }
  const translatedText = extractOpenAIOutputText(parsed);
  if (statusCode >= 200 && statusCode < 300 && translatedText) {
    return { ok: true, statusCode, message: "OpenAI GPT 测试成功。", translatedText, rawResponse };
  }
  return {
    ok: false,
    statusCode,
    message: openAIErrorMessage(parsed) ?? `OpenAI 返回 HTTP ${statusCode}。`,
    rawResponse,
  };
}

export async function translateOpenAI(
  apiKey: string,
  text: string,
  context?: string,
  model = DEFAULT_OPENAI_MODEL,
  prompt = DEFAULT_OPENAI_TRANSLATION_PROMPT,
): Promise<TranslationServiceTestResult> {
  const key = apiKey.trim();
  const source = text.trim();
  if (!key) return { ok: false, message: "请先填写 OpenAI API Key。" };
  if (!source) return { ok: false, message: "没有可翻译的文本。" };
  const body = buildOpenAIRequestBody(source, context, model, prompt);
  return requestJson({
    hostname: "api.openai.com",
    path: "/v1/responses",
    headers: { Authorization: `Bearer ${key}` },
    body,
    parse: parseOpenAIResponse,
  });
}

export async function testOpenAI(
  apiKey: string,
  sampleText: string,
  model = DEFAULT_OPENAI_MODEL,
  prompt = DEFAULT_OPENAI_TRANSLATION_PROMPT,
): Promise<TranslationServiceTestResult> {
  const text = sampleText.trim();
  if (!text) return { ok: false, message: "请输入测试样本句子。" };
  return translateOpenAI(apiKey, text, undefined, model, prompt);
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

function requestJson(options: {
  hostname: string;
  path: string;
  headers?: Record<string, string>;
  body: string;
  parse: (statusCode: number, rawResponse: string) => TranslationServiceTestResult;
}): Promise<TranslationServiceTestResult> {
  return new Promise((resolve) => {
    const request = https.request({
      hostname: options.hostname,
      path: options.path,
      method: "POST",
      headers: {
        ...(options.headers ?? {}),
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(options.body),
      },
      timeout: 30_000,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve(options.parse(response.statusCode ?? 0, Buffer.concat(chunks).toString("utf8"))));
    });
    request.on("timeout", () => request.destroy(new Error("请求超时（30 秒）。")));
    request.on("error", (error) => resolve({ ok: false, message: `请求失败：${error.message}` }));
    request.write(options.body);
    request.end();
  });
}

function extractOpenAIOutputText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const direct = (value as { output_text?: unknown }).output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const output = (value as { output?: unknown }).output;
  if (!Array.isArray(output)) return undefined;
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const piece of content) {
      if (!piece || typeof piece !== "object") continue;
      const text = (piece as { text?: unknown; type?: unknown }).text;
      if (typeof text === "string" && text.trim()) parts.push(text);
    }
  }
  const joined = parts.join("\n").trim();
  return joined || undefined;
}

function openAIErrorMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const error = (value as { error?: unknown }).error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return undefined;
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
