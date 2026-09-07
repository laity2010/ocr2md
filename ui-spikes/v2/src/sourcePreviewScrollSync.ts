import type { WorkingEditor } from "./workingEditor";

type SyncOrigin = "editor" | "preview";

export class SourcePreviewScrollSync {
  private syncOrigin: SyncOrigin | undefined;
  private editorFrame = 0;
  private previewFrame = 0;
  private readonly removeEditorScrollListener: () => void;

  constructor(
    private readonly editor: WorkingEditor,
    private readonly preview: HTMLElement,
  ) {
    this.removeEditorScrollListener = editor.onScroll(() => {
      if (this.syncOrigin === "preview") return;
      cancelAnimationFrame(this.editorFrame);
      this.editorFrame = requestAnimationFrame(() => this.syncPreviewFromEditor());
    });

    preview.addEventListener(
      "scroll",
      () => {
        if (this.syncOrigin === "editor") return;
        cancelAnimationFrame(this.previewFrame);
        this.previewFrame = requestAnimationFrame(() => this.syncEditorFromPreview());
      },
      { passive: true },
    );
  }

  syncFromEditor(): void {
    cancelAnimationFrame(this.editorFrame);
    this.editorFrame = requestAnimationFrame(() => this.syncPreviewFromEditor());
  }

  destroy(): void {
    cancelAnimationFrame(this.editorFrame);
    cancelAnimationFrame(this.previewFrame);
    this.removeEditorScrollListener();
  }

  private sourceBlocks(): HTMLElement[] {
    return Array.from(
      this.preview.querySelectorAll<HTMLElement>("[data-source-line]"),
    ).filter((node) => Number.isFinite(Number(node.dataset.sourceLine)));
  }

  private previewBlockForLine(line: number): HTMLElement | undefined {
    const blocks = this.sourceBlocks();
    let candidate = blocks[0];

    for (const block of blocks) {
      const sourceLine = Number(block.dataset.sourceLine);
      if (sourceLine > line) break;
      candidate = block;
    }

    return candidate;
  }

  private previewTopLine(): number | undefined {
    const blocks = this.sourceBlocks();
    if (!blocks.length) return undefined;

    const previewTop = this.preview.getBoundingClientRect().top + 20;
    let candidate = blocks[0];

    for (const block of blocks) {
      if (block.getBoundingClientRect().top > previewTop) break;
      candidate = block;
    }

    return Number(candidate.dataset.sourceLine);
  }

  private syncPreviewFromEditor(): void {
    if (this.syncOrigin === "preview") return;

    const line = this.editor.topVisibleLine();
    const block = this.previewBlockForLine(line);
    if (!block) return;

    const previewRect = this.preview.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();

    this.syncOrigin = "editor";
    this.preview.scrollTop += blockRect.top - previewRect.top - 16;
    this.preview.dataset.syncOrigin = "editor";
    this.preview.dataset.syncSourceLine = String(
      Number(block.dataset.sourceLine),
    );

    requestAnimationFrame(() => {
      this.syncOrigin = undefined;
    });
  }

  private syncEditorFromPreview(): void {
    if (this.syncOrigin === "editor") return;

    const line = this.previewTopLine();
    if (!line) return;

    this.syncOrigin = "preview";
    this.editor.scrollLineToTop(line);
    this.preview.dataset.syncOrigin = "preview";
    this.preview.dataset.syncSourceLine = String(line);

    requestAnimationFrame(() => {
      this.syncOrigin = undefined;
    });
  }
}
