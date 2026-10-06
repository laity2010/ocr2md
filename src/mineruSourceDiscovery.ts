import * as fs from "fs";
import * as path from "path";

export type MineruSourceMatchStatus =
  | "matched"
  | "missing-markdown"
  | "missing-json"
  | "invalid-json"
  | "unmatched"
  | "ambiguous";

export interface MineruSourceFiles {
  projectRoot: string;
  markdownPaths: string[];
  jsonPaths: string[];
}

export interface MineruJsonMatchCandidate {
  jsonPath: string;
  valid: boolean;
  pageCount?: number;
  probeCount: number;
  matchedProbeCount: number;
  score: number;
  error?: string;
}

export interface MineruSourceMatchResult {
  status: MineruSourceMatchStatus;
  markdownPath: string;
  jsonPath?: string;
  candidates: MineruJsonMatchCandidate[];
  reason: string;
}

export interface MineruSourcePairDiscovery {
  files: MineruSourceFiles;
  matches: MineruSourceMatchResult[];
}

const MIN_PROBE_LENGTH = 24;
const MAX_PROBES = 12;
const MATCH_THRESHOLD = 0.6;
const AMBIGUITY_MARGIN = 0.1;

interface CachedMineruSignature {
  statKey: string;
  valid: boolean;
  pageCount?: number;
  probes: string[];
  error?: string;
}

const signatureCache = new Map<string, CachedMineruSignature>();

/** Invalidate candidate signatures when an upstream content-hash detects
 * changes not visible through the legacy size + mtime signature key. */
export function invalidateMineruSourceSignatures(jsonPaths?: readonly string[]): void {
  if (!jsonPaths) {
    signatureCache.clear();
    return;
  }
  for (const jsonPath of jsonPaths) signatureCache.delete(path.resolve(jsonPath));
}

export function discoverMineruSourceFiles(projectRoot: string): MineruSourceFiles {
  const resolvedRoot = path.resolve(projectRoot);
  const markdownPaths = safeReadDirectory(resolvedRoot)
    .filter((entry) => entry.isFile() && isMineruMarkdownName(entry.name))
    .map((entry) => path.join(resolvedRoot, entry.name))
    .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));

  const jsonRoot = path.join(resolvedRoot, "json");
  const jsonPaths = safeReadDirectory(jsonRoot)
    .filter((entry) => entry.isFile() && /\.json$/i.test(entry.name))
    .map((entry) => path.join(jsonRoot, entry.name))
    .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));

  return { projectRoot: resolvedRoot, markdownPaths, jsonPaths };
}

export function discoverMineruSourcePairs(projectRoot: string): MineruSourcePairDiscovery {
  const files = discoverMineruSourceFiles(projectRoot);
  return {
    files,
    matches: files.markdownPaths.map((markdownPath) =>
      matchMineruJsonForMarkdown(markdownPath, files.jsonPaths)),
  };
}

export function matchMineruJsonForMarkdown(
  markdownPath: string,
  jsonPaths: readonly string[],
): MineruSourceMatchResult {
  const resolvedMarkdown = path.resolve(markdownPath);
  let markdown: string;
  try {
    markdown = fs.readFileSync(resolvedMarkdown, "utf8");
  } catch (error) {
    return {
      status: "missing-markdown",
      markdownPath: resolvedMarkdown,
      candidates: [],
      reason: "无法读取 MinerU Markdown：" + errorMessage(error),
    };
  }

  if (jsonPaths.length === 0) {
    return {
      status: "missing-json",
      markdownPath: resolvedMarkdown,
      candidates: [],
      reason: "项目 json/ 中没有 MinerU JSON 候选。",
    };
  }

  const normalizedMarkdown = normalizeMineruText(markdown);
  const candidates = jsonPaths.map((jsonPath) =>
    scoreMineruJsonCandidate(path.resolve(jsonPath), normalizedMarkdown));

  const valid = candidates
    .filter((candidate) => candidate.valid)
    .sort((left, right) =>
      right.score - left.score
      || right.matchedProbeCount - left.matchedProbeCount
      || left.jsonPath.localeCompare(right.jsonPath, "zh-CN", { numeric: true }));

  if (valid.length === 0) {
    return {
      status: "invalid-json",
      markdownPath: resolvedMarkdown,
      candidates,
      reason: "json/ 中存在候选文件，但没有可读取的 MinerU pdf_info JSON。",
    };
  }

  const best = valid[0];
  if (!candidatePassesThreshold(best)) {
    return {
      status: "unmatched",
      markdownPath: resolvedMarkdown,
      candidates,
      reason: "没有 JSON 的内容签名足以匹配当前 Markdown；最高匹配率 "
        + formatScore(best.score) + "。",
    };
  }

  const competing = valid.filter((candidate, index) =>
    index > 0
    && candidatePassesThreshold(candidate)
    && best.score - candidate.score < AMBIGUITY_MARGIN);

  if (competing.length > 0) {
    return {
      status: "ambiguous",
      markdownPath: resolvedMarkdown,
      candidates,
      reason: "有 " + (competing.length + 1)
        + " 份 JSON 与当前 Markdown 同时达到高置信度，拒绝猜测。",
    };
  }

  return {
    status: "matched",
    markdownPath: resolvedMarkdown,
    jsonPath: best.jsonPath,
    candidates,
    reason: "内容签名唯一匹配：" + best.matchedProbeCount + "/"
      + best.probeCount + " probes。",
  };
}

export function normalizeMineruText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, "")
    .replace(/[ \t\n]+/g, "")
    .toLowerCase();
}

function isMineruMarkdownName(name: string): boolean {
  return /\.md$/i.test(name)
    && !name.startsWith(".")
    && (/mineru.*markdown/i.test(name) || /markdown.*mineru/i.test(name));
}

function safeReadDirectory(directory: string): fs.Dirent[] {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

function scoreMineruJsonCandidate(
  jsonPath: string,
  normalizedMarkdown: string,
): MineruJsonMatchCandidate {
  const signature = loadMineruJsonSignature(jsonPath);
  if (!signature.valid) {
    return invalidCandidate(jsonPath, signature.error ?? "无法读取 MinerU JSON。");
  }

  const matchedProbeCount = signature.probes
    .filter((probe) => normalizedMarkdown.includes(probe)).length;
  return {
    jsonPath,
    valid: true,
    pageCount: signature.pageCount,
    probeCount: signature.probes.length,
    matchedProbeCount,
    score: matchedProbeCount / signature.probes.length,
  };
}

function loadMineruJsonSignature(jsonPath: string): CachedMineruSignature {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(jsonPath);
  } catch (error) {
    return {
      statKey: "missing",
      valid: false,
      probes: [],
      error: "读取失败：" + errorMessage(error),
    };
  }
  const statKey = stat.size + ":" + stat.mtimeMs;
  const cached = signatureCache.get(jsonPath);
  if (cached?.statKey === statKey) return cached;

  let raw: string;
  try {
    raw = fs.readFileSync(jsonPath, "utf8");
  } catch (error) {
    const failed = {
      statKey,
      valid: false,
      probes: [],
      error: "读取失败：" + errorMessage(error),
    };
    signatureCache.set(jsonPath, failed);
    return failed;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const failed = {
      statKey,
      valid: false,
      probes: [],
      error: "JSON 解析失败：" + errorMessage(error),
    };
    signatureCache.set(jsonPath, failed);
    return failed;
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.pdf_info)) {
    const failed = {
      statKey,
      valid: false,
      probes: [],
      error: "缺少 MinerU pdf_info[]。",
    };
    signatureCache.set(jsonPath, failed);
    return failed;
  }

  const probes = buildContentProbes(parsed.pdf_info);
  if (probes.length === 0) {
    const failed = {
      statKey,
      valid: false,
      probes: [],
      error: "pdf_info[] 中没有足够的文本用于内容配对。",
    };
    signatureCache.set(jsonPath, failed);
    return failed;
  }

  const loaded: CachedMineruSignature = {
    statKey,
    valid: true,
    pageCount: parsed.pdf_info.length,
    probes,
  };
  signatureCache.set(jsonPath, loaded);
  return loaded;
}

function buildContentProbes(pdfInfo: unknown[]): string[] {
  const chunks: string[] = [];
  for (const page of pdfInfo) {
    if (!isRecord(page) || !Array.isArray(page.para_blocks)) continue;
    collectBlockTextChunks(page.para_blocks, chunks);
  }

  const eligible = chunks
    .map((chunk) => normalizeMineruText(chunk))
    .filter((chunk) => chunk.length >= MIN_PROBE_LENGTH);

  if (eligible.length === 0) return [];

  const indices = quantileIndices(eligible.length, Math.min(MAX_PROBES, eligible.length));
  const probes = new Set<string>();
  for (const index of indices) {
    const chunk = eligible[index];
    if (!chunk) continue;
    probes.add(chunk.slice(0, 96));
  }
  return [...probes];
}

function collectBlockTextChunks(blocks: unknown[], output: string[]): void {
  for (const block of blocks) {
    if (!isRecord(block)) continue;
    if (Array.isArray(block.lines)) {
      for (const line of block.lines) {
        if (!isRecord(line) || !Array.isArray(line.spans)) continue;
        const lineText = line.spans
          .filter(isRecord)
          .filter((span) => span.type === "text" && typeof span.content === "string")
          .map((span) => span.content as string)
          .join("");
        if (lineText.trim()) output.push(lineText);
      }
    }
    if (Array.isArray(block.blocks)) {
      collectBlockTextChunks(block.blocks, output);
    }
  }
}

function quantileIndices(length: number, count: number): number[] {
  if (count <= 1 || length <= 1) return [0];
  const result: number[] = [];
  for (let index = 0; index < count; index += 1) {
    result.push(Math.round(index * (length - 1) / (count - 1)));
  }
  return [...new Set(result)];
}

function candidatePassesThreshold(candidate: MineruJsonMatchCandidate): boolean {
  const requiredMatches = Math.min(3, candidate.probeCount);
  return candidate.score >= MATCH_THRESHOLD
    && candidate.matchedProbeCount >= requiredMatches;
}

function invalidCandidate(jsonPath: string, error: string): MineruJsonMatchCandidate {
  return {
    jsonPath,
    valid: false,
    probeCount: 0,
    matchedProbeCount: 0,
    score: 0,
    error,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatScore(score: number): string {
  return Math.round(score * 100) + "%";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
