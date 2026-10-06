import * as crypto from "crypto";
import type { MineruJsonLocator, MineruMarkdownLocator } from "./mineruAnnotationContract";
import type { MineruProjectAnnotationSourceMap } from "./mineruAnnotationSourceMap";

export type MineruAuditKind =
  | "序号疑似缺失" | "MD引用缺失" | "注释正文缺失"
  | "正文引用缺失" | "重复注释正文" | "匹配歧义"
  | "未识别页脚" | "待验证引用" | "来源异常";

export interface MineruAuditEvidence {
  id: string;
  kind: MineruAuditKind;
  documentKey: string;
  pageIndex?: number;
  pageNumber?: number;
  annotationNumber?: number;
  summary: string;
  detail: string;
  json?: MineruJsonLocator;
  navigationTargets: MineruMarkdownLocator[];
  candidateLocations: Array<{ chapterPath: string; lineIndex: number; anchorText: string }>;
}

export interface MineruAuditReport {
  sourceFingerprint: string;
  entries: MineruAuditEvidence[];
  counts: Record<string, number>;
}

function evidenceId(doc: string, pageIndex: number | undefined, kind: MineruAuditKind, suffix: string): string {
  // Keep IDs deterministic and private-document scoped. Content changes
  // invalidate decisions through the source fingerprint, not by losing IDs.
  const key = JSON.stringify([doc, pageIndex ?? -1, kind, suffix]);
  return "mineru-audit:" + crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
}

export function auditMineruAnnotations(source: MineruProjectAnnotationSourceMap): MineruAuditReport {
  const entries: MineruAuditEvidence[] = [];
  const add = (
    doc: string, pageIndex: number | undefined, kind: MineruAuditKind,
    suffix: string, summary: string, detail: string,
    json?: MineruJsonLocator,
    targets: MineruMarkdownLocator[] = [],
    candidates: MineruAuditEvidence["candidateLocations"] = [],
  ): void => {
    entries.push({
      id: evidenceId(doc, pageIndex, kind, suffix),
      kind, documentKey: doc, pageIndex,
      pageNumber: pageIndex === undefined ? undefined : pageIndex + 1,
      annotationNumber: /^n(\d+)$/.test(suffix) ? Number(suffix.slice(1)) : undefined,
      summary, detail, json,
      navigationTargets: targets,
      candidateLocations: candidates,
    });
  };

  for (const document of source.documents) {
    const facts = document.facts;
    const doc = facts.documentKey;
    // Never combine the numbering of adjacent PDF pages or distinct JSON files.
    const pages = new Map<number, Set<number>>();
    for (const group of facts.annotations) {
      const numbers = pages.get(group.pageIndex) ?? new Set<number>();
      numbers.add(group.annotationNumber);
      pages.set(group.pageIndex, numbers);
      const mapped = document.annotations.find((item) =>
        item.pageIndex === group.pageIndex &&
        item.annotationNumber === group.annotationNumber);
      const matches = document.references.filter((item) =>
        item.pageIndex === group.pageIndex &&
        item.annotationNumber === group.annotationNumber);
      const targets = (mapped?.references ?? [])
        .map((ref) => ref.markdown)
        .filter((ref): ref is MineruMarkdownLocator => Boolean(ref));
      const related = group.bodies[0]?.json ?? group.references[0]?.json;
      const base = "第 " + (group.pageIndex + 1) + " 页 · 注释 " + group.annotationNumber;
      const note = group.bodies.map((b) => b.raw).join("\n") ||
        group.references.map((r) => r.context).join("\n");
      if (group.bodies.length === 0) {
        add(doc, group.pageIndex, "注释正文缺失", "n" + group.annotationNumber,
          base + " 缺注释正文", note || "已有正文引用，但 JSON 没有同页同号的注释正文", related, targets);
      }
      if (group.references.length === 0) {
        add(doc, group.pageIndex, "正文引用缺失", "n" + group.annotationNumber,
          base + " 缺正文引用", note || "JSON 已识别注释正文，但找不到同页正文引用", related);
      }
      if (group.bodies.length > 1) {
        add(doc, group.pageIndex, "重复注释正文", "n" + group.annotationNumber,
          base + " 出现 " + group.bodies.length + " 条正文候选", note, related, targets);
      }
      if (matches.some((match) => match.status === "missing")) {
        add(doc, group.pageIndex, "MD引用缺失", "n" + group.annotationNumber,
          base + " MD 引用未定位", group.references.map((r) => r.context).join("\n"),
          related, targets);
      }
      const ambiguous = matches.filter((match) => match.status === "ambiguous");
      if (ambiguous.length) {
        add(doc, group.pageIndex, "匹配歧义", "n" + group.annotationNumber,
          base + " 多处 MD 候选", group.references.map((r) => r.context).join("\n"),
          related, targets,
          ambiguous.flatMap((match) => match.candidates.map((candidate) => ({
            chapterPath: candidate.chapterPath,
            lineIndex: candidate.lineIndex,
            anchorText: candidate.anchorText,
          }))));
      }
    }
    for (const [pageIndex, numbers] of pages) {
      // Only a *suspected* gap: MinerU may miss both the reference and body.
      // Do not manufacture a confirmed annotation or assume all pages start at ①.
      const max = Math.max(...numbers);
      if (max > 50) continue; // unsupported numbering needs human evidence
      for (let number = 1; number < max; number += 1) {
        if (numbers.has(number)) continue;
        add(doc, pageIndex, "序号疑似缺失", "n" + number,
          "第 " + (pageIndex + 1) + " 页 · 疑似缺少注释 " + number,
          "同一 PDF 物理页识别到 " + [...numbers].sort((a, b) => a - b).join("、")
            + "，但没有 " + number + "。此处只提示人工查原 PDF，不自动补号");
      }
    }
    for (const footnote of facts.unidentifiedFootnotes) {
      add(doc, footnote.pageIndex, "未识别页脚", "block" + footnote.json.blockIndex,
        "第 " + (footnote.pageIndex + 1) + " 页 · 无法识别的页脚",
        "[" + footnote.reason + "] " + footnote.raw, footnote.json);
    }
    for (const refs of facts.unverifiedReferences) {
      add(doc, refs.pageIndex, "待验证引用", "n" + refs.annotationNumber,
        "第 " + (refs.pageIndex + 1) + " 页 · " + refs.annotationNumber + " 未验证引用",
        "该物理页没有可靠的注释正文，可能是 CIP 编目等非注释内容。\n"
          + refs.references.map((r) => r.context).join("\n"),
        refs.references[0]?.json);
    }
  }
  for (const [index, issue] of source.issues.entries()) {
    if (issue.type !== "pairing" && issue.type !== "unpaired-json" &&
      issue.type !== "load-error") continue;
    const doc = issue.documentKey ?? issue.sourceJsonPath ?? "unknown";
    add(doc, issue.pageIndex, "来源异常", "source" + index,
      "无法确认 MinerU 来源配对", issue.reason);
  }
  entries.sort((a, b) =>
    a.documentKey.localeCompare(b.documentKey, "zh-CN", { numeric: true })
    || (a.pageIndex ?? -1) - (b.pageIndex ?? -1)
    || (a.annotationNumber ?? 0) - (b.annotationNumber ?? 0)
    || a.kind.localeCompare(b.kind, "zh-CN"));
  const counts: Record<string, number> = {};
  for (const item of entries) counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  return { sourceFingerprint: source.sourceFingerprint, entries, counts };
}
