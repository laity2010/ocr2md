const STORAGE_KEY = "ocr2md-v2-workspace-split-v1";
const DEFAULT_LEFT_PERCENT = 43;
const MIN_LEFT_PERCENT = 25;
const MAX_LEFT_PERCENT = 70;
const MIN_LEFT_PX = 340;
const MIN_RIGHT_PX = 360;
const SPLITTER_PX = 6;

function clamp(value: number): number {
  return Math.max(MIN_LEFT_PERCENT, Math.min(MAX_LEFT_PERCENT, value));
}

function loadLeftPercent(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LEFT_PERCENT;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clamp(parsed) : DEFAULT_LEFT_PERCENT;
  } catch {
    return DEFAULT_LEFT_PERCENT;
  }
}

function saveLeftPercent(value: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Resizing still works when storage is unavailable.
  }
}

export class WorkspaceSplitter {
  private leftPercent = loadLeftPercent();
  private activePointerId: number | undefined;
  private readonly resizeObserver: ResizeObserver;

  constructor(
    private readonly workspace: HTMLElement,
    private readonly splitter: HTMLElement,
  ) {
    this.splitter.addEventListener("pointerdown", (event) => {
      if (window.matchMedia("(max-width: 700px)").matches) return;
      event.preventDefault();
      this.activePointerId = event.pointerId;
      this.splitter.setPointerCapture(event.pointerId);
      this.splitter.classList.add("is-dragging");
      document.body.classList.add("is-resizing-workspace");
    });

    this.splitter.addEventListener("pointermove", (event) => {
      if (
        this.activePointerId !== event.pointerId
        || !this.splitter.hasPointerCapture(event.pointerId)
      ) {
        return;
      }
      const rect = this.workspace.getBoundingClientRect();
      if (rect.width <= 0) return;
      this.apply(((event.clientX - rect.left) / rect.width) * 100);
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
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      this.apply(
        this.leftPercent + (event.key === "ArrowRight" ? 2 : -2),
      );
      saveLeftPercent(this.leftPercent);
    });

    this.resizeObserver = new ResizeObserver(() => {
      const before = this.leftPercent;
      this.apply(this.leftPercent);
      if (this.leftPercent !== before) saveLeftPercent(this.leftPercent);
    });
    this.resizeObserver.observe(this.workspace);

    this.apply(this.leftPercent);
    saveLeftPercent(this.leftPercent);
  }

  getLeftPercent(): number {
    return this.leftPercent;
  }

  reset(): void {
    this.apply(DEFAULT_LEFT_PERCENT);
    saveLeftPercent(this.leftPercent);
  }

  private apply(value: number): void {
    this.leftPercent = this.clampToWorkspace(clamp(value));
    this.workspace.style.setProperty(
      "--left-pane-width",
      `${this.leftPercent}%`,
    );
    this.splitter.setAttribute(
      "aria-valuenow",
      String(Math.round(this.leftPercent)),
    );
    window.dispatchEvent(new Event("resize"));
  }

  private clampToWorkspace(value: number): number {
    const width = this.workspace.getBoundingClientRect().width;
    if (width <= 0 || width <= MIN_LEFT_PX + SPLITTER_PX + MIN_RIGHT_PX) {
      return value;
    }

    const minimum = Math.max(
      MIN_LEFT_PERCENT,
      (MIN_LEFT_PX / width) * 100,
    );
    const maximum = Math.min(
      MAX_LEFT_PERCENT,
      ((width - SPLITTER_PX - MIN_RIGHT_PX) / width) * 100,
    );

    return Math.max(minimum, Math.min(maximum, value));
  }

  private finish(): void {
    this.activePointerId = undefined;
    this.splitter.classList.remove("is-dragging");
    document.body.classList.remove("is-resizing-workspace");
    saveLeftPercent(this.leftPercent);
    window.dispatchEvent(new Event("resize"));
  }
}
