const STORAGE_KEY = "ocr2md-v2-editor-preview-split-v1";
const DEFAULT_TOP_PERCENT = 55;
const MIN_TOP_PERCENT = 25;
const MAX_TOP_PERCENT = 75;

function clamp(value: number): number {
  return Math.max(MIN_TOP_PERCENT, Math.min(MAX_TOP_PERCENT, value));
}

function loadTopPercent(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TOP_PERCENT;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clamp(parsed) : DEFAULT_TOP_PERCENT;
  } catch {
    return DEFAULT_TOP_PERCENT;
  }
}

function saveTopPercent(value: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Splitter still works when storage is unavailable.
  }
}

export class EditorPreviewSplitter {
  private topPercent = loadTopPercent();
  private activePointerId: number | undefined;
  private dragStartY = 0;
  private dragStartTopPercent = DEFAULT_TOP_PERCENT;
  private dragPaneHeight = 0;

  constructor(
    private readonly pane: HTMLElement,
    private readonly splitter: HTMLElement,
  ) {
    this.splitter.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const paneRect = this.pane.getBoundingClientRect();
      const topTrack = Array.from(this.pane.children).find(
        (element) =>
          element instanceof HTMLElement
          && !element.hidden
          && (
            element.id === "working-editor"
            || element.id === "custom-css-wrap"
            || element.id === "table-config-wrap"
          ),
      );
      const renderedTopHeight =
        topTrack instanceof HTMLElement
          ? topTrack.getBoundingClientRect().height
          : (this.topPercent / 100) * paneRect.height;

      this.dragStartY = event.clientY;
      this.dragPaneHeight = paneRect.height;
      this.dragStartTopPercent =
        paneRect.height > 0
          ? (renderedTopHeight / paneRect.height) * 100
          : this.topPercent;
      this.activePointerId = event.pointerId;
      this.splitter.setPointerCapture(event.pointerId);
      this.splitter.classList.add("is-dragging");
      document.body.classList.add("is-resizing-editor-preview");
    });

    this.splitter.addEventListener("pointermove", (event) => {
      if (
        this.activePointerId !== event.pointerId
        || !this.splitter.hasPointerCapture(event.pointerId)
      ) return;
      if (this.dragPaneHeight <= 0) return;
      const deltaPercent =
        ((event.clientY - this.dragStartY) / this.dragPaneHeight) * 100;
      this.apply(this.dragStartTopPercent + deltaPercent);
    });

    this.splitter.addEventListener("pointerup", (event) => {
      if (this.activePointerId !== event.pointerId) return;
      if (this.splitter.hasPointerCapture(event.pointerId)) {
        this.splitter.releasePointerCapture(event.pointerId);
      }
      this.finish();
    });

    this.splitter.addEventListener("pointercancel", () => this.finish());

    this.splitter.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      this.apply(this.topPercent + (event.key === "ArrowDown" ? 2 : -2));
      saveTopPercent(this.topPercent);
    });

    this.apply(this.topPercent);
  }

  getTopPercent(): number {
    return this.topPercent;
  }

  reset(): void {
    this.apply(DEFAULT_TOP_PERCENT);
    saveTopPercent(this.topPercent);
  }

  private apply(value: number): void {
    this.topPercent = clamp(value);
    this.pane.style.setProperty("--editor-top-percent", String(this.topPercent) + "%");
    this.splitter.setAttribute("aria-valuenow", String(Math.round(this.topPercent)));
    window.dispatchEvent(new Event("resize"));
  }

  private finish(): void {
    this.activePointerId = undefined;
    this.dragPaneHeight = 0;
    this.splitter.classList.remove("is-dragging");
    document.body.classList.remove("is-resizing-editor-preview");
    saveTopPercent(this.topPercent);
    window.dispatchEvent(new Event("resize"));
  }
}
