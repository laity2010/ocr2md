import { candidatesFromSidecar } from "../../../src/sidecar";
import type {
  ChapterCatalog,
  ChapterRepository,
  ChapterSaveInput,
  ChapterSaveResult,
  ChapterWorkspaceData,
} from "./chapterRepository";

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fixture request failed: ${response.status} ${url}`);
  return response.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fixture request failed: ${response.status} ${url}`);
  return response.json();
}

export class FixtureChapterRepository implements ChapterRepository {
  private savedWorkingText: string | undefined;
  private revision = "fixture-1";
  private readonly chapterId = "fixture-buffett-01";

  constructor(private readonly baseUrl = "./fixtures/buffett-alpha") {}

  async listChapters(): Promise<ChapterCatalog> {
    return {
      projectName: "Buffett’s Alpha fixture",
      chapters: [{
        id: this.chapterId,
        name: "01 Buffett’s Alpha",
        ready: true,
        workingFile: "01 Buffett’s Alpha.working.md",
        sidecarFile: "01 Buffett’s Alpha.ocr2md.json",
      }],
    };
  }

  async loadChapter(chapterId: string): Promise<ChapterWorkspaceData> {
    if (chapterId !== this.chapterId) throw new Error(`unknown fixture chapter: ${chapterId}`);
    const [originalText, fixtureWorkingText, rawSidecar] = await Promise.all([
      fetchText(`${this.baseUrl}/source.md`),
      fetchText(`${this.baseUrl}/working.md`),
      fetchJson(`${this.baseUrl}/sidecar.json`),
    ]);
    const sidecar = candidatesFromSidecar(rawSidecar);

    return {
      id: this.chapterId,
      path: "fixture://buffetts-alpha/01",
      name: "01 Buffett’s Alpha.md",
      originalText,
      workingText: this.savedWorkingText ?? fixtureWorkingText,
      rows: sidecar.rows,
      annotationPairs: sidecar.annotationPairs,
      revision: this.revision,
    };
  }

  async saveChapter(input: ChapterSaveInput): Promise<ChapterSaveResult> {
    this.savedWorkingText = input.workingText;
    this.revision = `fixture-${Number(this.revision.split("-")[1] ?? "1") + 1}`;
    return {
      revision: this.revision,
      savedAt: new Date().toISOString(),
      workingText: input.workingText,
    };
  }
}
