import { ChapterReviewApplication } from "../../../src/chapterReviewApplication";
import { mergeSequenceMarkdown } from "../../../src/chapterBoundary";
import { withChapterFrontmatter } from "../../../src/chapterWorkspaceApplication";
import { MODULE_REGEX_DEFAULTS } from "../../../src/regexPresets";
import { candidatesFromSidecar, serializeSidecar } from "../../../src/sidecar";
import {
  backfillTranslationFingerprints,
  parseTranslationState,
  translationRows,
} from "../../../src/translationState";
import { scanTranslationUnits } from "../../../src/translationUnits";
import { markdownFileKind } from "../../../src/workspaceFiles";
import type {
  BoundaryExportResult,
  ChapterCatalog,
  ChapterRepository,
  ChapterSaveInput,
  ChapterSaveResult,
  ChapterWorkspaceData,
  TranslationStateSaveInput,
  TransSourceExportInput,
} from "./chapterRepository";

function splitPatterns(value: string): string[] {
  return value
    .split(/^\s*---\s*$/m)
    .map((item) => item.trim())
    .filter(Boolean);
}

const embedPatterns = splitPatterns(MODULE_REGEX_DEFAULTS["嵌入块"] ?? "");
const annotationPatterns = splitPatterns(MODULE_REGEX_DEFAULTS["注释"] ?? "");

type LoadedPayload = {
  id: string;
  path: string;
  name: string;
  originalText?: string;
  workingText: string;
  sidecar: unknown;
  revision: string;
};

type BoundaryPayload = {
  id: string;
  path: string;
  name: string;
  rootMarkdown: Array<{ name: string; text: string }>;
  workingText?: string;
  baselineText?: string;
  sidecar?: unknown;
  revision: string;
};

type TranslationPayload = {
  chapterId: string;
  chapterName: string;
  path: string;
  sourceText: string;
  translationState: unknown;
  revision: string;
};

const BOUNDARY_ID = "__boundary__";

export class PersistentChapterRepository implements ChapterRepository {
  async listChapters(): Promise<ChapterCatalog> {
    const [catalogResponse, boundaryResponse] = await Promise.all([
      fetch("/__workspace/chapters", { cache: "no-store" }),
      fetch("/__workspace/boundary", { cache: "no-store" }),
    ]);
    if (!catalogResponse.ok) {
      throw new Error(await responseError(catalogResponse, "读取章节目录失败"));
    }
    if (!boundaryResponse.ok) {
      throw new Error(await responseError(boundaryResponse, "读取 OCR 定界输入失败"));
    }
    const catalog = await catalogResponse.json() as ChapterCatalog;
    const boundary = await boundaryResponse.json() as BoundaryPayload;
    const inputs = boundary.rootMarkdown.filter(
      (item) => markdownFileKind(item.text) === "ocr",
    );
    return {
      ...catalog,
      boundary: {
        ready: inputs.length > 0 || Boolean(boundary.workingText),
        sourceFileCount: inputs.length,
        reason:
          inputs.length > 0 || boundary.workingText
            ? undefined
            : "项目根目录没有未完成章节定界的 Markdown",
      },
    };
  }

  async loadChapter(chapterId: string): Promise<ChapterWorkspaceData> {
    if (chapterId === BOUNDARY_ID) {
      return this.loadBoundary();
    }
    const response = await fetch(
      `/__workspace/chapter?chapterId=${encodeURIComponent(chapterId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(await responseError(response, "加载真实章节失败"));
    }

    const payload = await response.json() as LoadedPayload;
    const sidecar = candidatesFromSidecar(payload.sidecar);
    const application = new ChapterReviewApplication({
      rows: sidecar.rows,
      annotationPairs: sidecar.annotationPairs,
    });
    const previousTitle = sidecar.rows.find(
      (row) => row.typeLabel === "章节标题",
    );
    const previousIllegal = sidecar.rows.find(
      (row) => row.typeLabel === "非法断行",
    );
    const previousAnnotation = sidecar.rows.find(
      (row) => row.typeLabel === "注释",
    );
    const previousEmbed = sidecar.rows.find(
      (row) => row.typeLabel === "嵌入块",
    );
    const sourcePath =
      previousTitle?.sourcePath
      ?? previousAnnotation?.sourcePath
      ?? previousEmbed?.sourcePath
      ?? previousIllegal?.sourcePath
      ?? payload.path;
    const workingPath =
      previousTitle?.workingCopyPath
      ?? previousAnnotation?.workingCopyPath
      ?? previousEmbed?.workingCopyPath
      ?? previousIllegal?.workingCopyPath
      ?? payload.path;

    application.refreshChapterTitle({
      baselineText: payload.workingText,
      workingText: payload.workingText,
      sourcePath,
      workingPath,
      sourceLabel: payload.name,
      embedPatterns,
    });
    application.refreshAnnotation({
      baselineText: payload.workingText,
      workingText: payload.workingText,
      sourcePath,
      workingPath,
      sourceLabel: payload.name,
      patterns: annotationPatterns,
    });
    application.refreshEmbed({
      baselineText: payload.workingText,
      workingText: payload.workingText,
      sourcePath,
      workingPath,
      sourceLabel: payload.name,
      patterns: embedPatterns,
    });
    const refreshed = application.refreshIllegalLineBreak({
      workingText: payload.workingText,
      sourcePath,
      workingPath,
    });

    return {
      id: payload.id,
      kind: "chapter",
      path: payload.path,
      name: payload.name,
      originalText: payload.originalText ?? payload.workingText,
      workingText: payload.workingText,
      rows: refreshed.rows,
      annotationPairs: refreshed.annotationPairs,
      sidecarSourceFile: sidecar.sourceFile,
      revision: payload.revision,
    };
  }

  async saveChapter(input: ChapterSaveInput): Promise<ChapterSaveResult> {
    if (input.chapter.kind === "boundary" || input.chapter.id === BOUNDARY_ID) {
      return this.saveBoundary(input);
    }
    const response = await fetch("/__workspace/chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        chapterId: input.chapter.id,
        expectedRevision: input.chapter.revision,
        workingText: input.workingText,
        sidecar: serializeSidecar(
          input.chapter.sidecarSourceFile ?? input.chapter.name,
          input.chapter.rows,
          input.chapter.annotationPairs,
        ),
      }),
    });
    if (!response.ok) {
      throw new Error(await responseError(response, "保存真实章节失败"));
    }

    return response.json() as Promise<ChapterSaveResult>;
  }

  async exportBoundary(input: ChapterSaveInput): Promise<BoundaryExportResult> {
    if (input.chapter.kind !== "boundary" && input.chapter.id !== BOUNDARY_ID) {
      throw new Error("只有章节定界工作稿可以导出章节");
    }
    const application = new ChapterReviewApplication({
      rows: input.chapter.rows,
      annotationPairs: input.chapter.annotationPairs,
    });
    const segments = application.chapterBoundarySegments(input.workingText);
    if (!segments.length) {
      throw new Error("请先为至少一个 1 级标题设置章节文件");
    }
    const lines = input.workingText.replace(/\r\n?/g, "\n").split("\n");
    const now = new Date();
    const outputs = segments.map((segment) => ({
      chapterFile: segment.chapterFile,
      text: withChapterFrontmatter(
        lines.slice(segment.startLine, segment.endLine).join("\n"),
        segment.chapterFile,
        input.chapter.name,
        now,
      ),
      sidecar: serializeSidecar(segment.chapterFile, [], []),
    }));
    const response = await fetch("/__workspace/boundary/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        expectedRevision: input.chapter.revision,
        workingText: input.workingText,
        baselineText: input.chapter.originalText,
        sourceFiles: input.chapter.boundarySourceFiles ?? [],
        sidecar: serializeSidecar(
          input.chapter.sidecarSourceFile ?? input.chapter.name,
          input.chapter.rows,
          input.chapter.annotationPairs,
        ),
        outputs,
      }),
    });
    if (!response.ok) {
      throw new Error(await responseError(response, "导出章节失败"));
    }
    return response.json() as Promise<BoundaryExportResult>;
  }

  async exportTransSource(
    input: TransSourceExportInput,
  ): Promise<ChapterWorkspaceData> {
    const response = await fetch("/__workspace/translation/source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        chapterId: input.chapterId,
        expectedRevision: input.expectedRevision,
        markdown: input.markdown,
      }),
    });
    if (!response.ok) {
      throw new Error(
        await responseError(response, "导出标定到 trans 失败"),
      );
    }
    return this.translationWorkspace(
      await response.json() as TranslationPayload,
    );
  }

  async loadTranslation(chapterId: string): Promise<ChapterWorkspaceData> {
    const response = await fetch(
      `/__workspace/translation?chapterId=${encodeURIComponent(chapterId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(
        await responseError(response, "加载翻译工作台失败"),
      );
    }
    return this.translationWorkspace(
      await response.json() as TranslationPayload,
    );
  }

  async saveTranslationState(
    input: TranslationStateSaveInput,
  ): Promise<ChapterWorkspaceData> {
    if (
      input.chapter.kind !== "translation"
      || !input.chapter.translationSourceChapterId
    ) {
      throw new Error("只有翻译工作台可以保存翻译状态");
    }
    const response = await fetch("/__workspace/translation/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        chapterId: input.chapter.translationSourceChapterId,
        expectedRevision: input.chapter.revision,
        translationState: input.translationState,
      }),
    });
    if (!response.ok) {
      throw new Error(
        await responseError(response, "保存翻译状态失败"),
      );
    }
    return this.translationWorkspace(
      await response.json() as TranslationPayload,
    );
  }

  private async loadBoundary(): Promise<ChapterWorkspaceData> {
    const response = await fetch("/__workspace/boundary", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await responseError(response, "加载章节定界工作稿失败"));
    }
    const payload = await response.json() as BoundaryPayload;
    const inputs = payload.rootMarkdown
      .filter((item) => markdownFileKind(item.text) === "ocr")
      .map((item) => ({ path: item.name, text: item.text }));
    const merged = mergeSequenceMarkdown(inputs);
    const workingText = payload.workingText ?? merged;
    if (!workingText) {
      throw new Error("项目根目录没有可用于章节定界的 OCR Markdown");
    }
    const baselineText = payload.baselineText ?? merged ?? workingText;
    const sidecar = payload.sidecar
      ? candidatesFromSidecar(payload.sidecar)
      : { rows: [], annotationPairs: [], sourceFile: payload.name };
    const application = new ChapterReviewApplication({
      rows: sidecar.rows,
      annotationPairs: sidecar.annotationPairs,
    });
    const refreshed = application.refreshChapterBoundary({
      baselineText,
      workingText,
      workingPath: payload.path,
      sourceLabel: payload.name,
    });
    let revision = payload.revision;
    if (
      payload.workingText == null
      || payload.baselineText == null
      || payload.sidecar == null
    ) {
      const ensureResponse = await fetch("/__workspace/boundary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          expectedRevision: payload.revision,
          workingText,
          baselineText,
          sourceFiles: inputs.map((item) => item.path),
          sidecar: serializeSidecar(
            sidecar.sourceFile ?? payload.name,
            refreshed.rows,
            refreshed.annotationPairs,
          ),
        }),
      });
      if (!ensureResponse.ok) {
        throw new Error(
          await responseError(
            ensureResponse,
            "创建章节定界工作稿失败",
          ),
        );
      }
      const ensured = await ensureResponse.json() as ChapterSaveResult;
      revision = ensured.revision;
    }
    return {
      id: BOUNDARY_ID,
      kind: "boundary",
      path: payload.path,
      name: payload.name,
      originalText: baselineText,
      workingText,
      rows: refreshed.rows,
      annotationPairs: refreshed.annotationPairs,
      sidecarSourceFile: sidecar.sourceFile ?? payload.name,
      revision,
      boundarySourceFiles: inputs.map((item) => item.path),
    };
  }

  private translationWorkspace(
    payload: TranslationPayload,
  ): ChapterWorkspaceData {
    const units = scanTranslationUnits(payload.sourceText, payload.path);
    const state = parseTranslationState(
      JSON.stringify(payload.translationState ?? {}),
      payload.path,
    );
    backfillTranslationFingerprints(units, state);
    return {
      id: `translation:${payload.chapterId}`,
      kind: "translation",
      path: payload.path,
      name: payload.chapterName,
      originalText: payload.sourceText,
      workingText: payload.sourceText,
      rows: translationRows(units, state, "deepl"),
      annotationPairs: [],
      revision: payload.revision,
      translationState: state,
      translationSourceChapterId: payload.chapterId,
      translationServiceId: "deepl",
    };
  }

  private async saveBoundary(input: ChapterSaveInput): Promise<ChapterSaveResult> {
    const response = await fetch("/__workspace/boundary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        expectedRevision: input.chapter.revision,
        workingText: input.workingText,
        baselineText: input.chapter.originalText,
        sourceFiles: input.chapter.boundarySourceFiles ?? [],
        sidecar: serializeSidecar(
          input.chapter.sidecarSourceFile ?? input.chapter.name,
          input.chapter.rows,
          input.chapter.annotationPairs,
        ),
      }),
    });
    if (!response.ok) {
      throw new Error(await responseError(response, "保存章节定界工作稿失败"));
    }
    return response.json() as Promise<ChapterSaveResult>;
  }
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error || `${fallback} (${response.status})`;
  } catch {
    return `${fallback} (${response.status})`;
  }
}
