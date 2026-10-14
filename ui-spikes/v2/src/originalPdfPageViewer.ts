/** Small single-page image viewer. PDF.js renders only on the Mac server. */
export class OriginalPdfPageViewer {
  private readonly stage = required<HTMLElement>("original-pdf-page-stage");
  private readonly image = required<HTMLImageElement>("original-pdf-image");
  private readonly art = required<HTMLElement>("original-pdf-page-art");
  private readonly marker = required<HTMLElement>("original-pdf-focus");
  private readonly status = required<HTMLElement>("original-pdf-render-status");
  private readonly prev = required<HTMLButtonElement>("original-pdf-prev");
  private readonly next = required<HTMLButtonElement>("original-pdf-next");
  private readonly smaller = required<HTMLButtonElement>("original-pdf-zoom-out");
  private readonly larger = required<HTMLButtonElement>("original-pdf-zoom-in");
  private source = "";
  private page = 0;
  private total = 0;
  private zoom = 1;
  private enabled = false;
  private requestId = 0;
  private readonly adjacentImages = new Map<number, HTMLImageElement>();
  private prewarmUrl = "";
  private prewarmPages: number[] = [];
  private readonly prewarmedPages = new Set<number>();
  private readonly prewarmedObjectUrls = new Map<number, string>();
  private prewarmController?: AbortController;
  private prewarmTimer?: number;
  private warmController?: AbortController;
  private warmKey = "";
  private pagePrewarmEnabled = false;
  private auditRegion?: {
    page: number; printed?: number; bbox?: number[];
    pageSize?: number[]; footnote: boolean;
  };

  constructor(private readonly label: HTMLElement) {
    this.prev.addEventListener("click", () => this.changePage(-1));
    this.next.addEventListener("click", () => this.changePage(1));
    this.smaller.addEventListener("click", () => this.changeZoom(1 / 1.25));
    this.larger.addEventListener("click", () => this.changeZoom(1.25));
    this.refreshControls();
  }

  prewarm(url: string, pages: number[]): void {
    if (!url.startsWith("/__workspace/original-pdf?")) return;
    const unique = [...new Set(pages.filter((page) =>
      Number.isSafeInteger(page) && page > 0))];
    if (!unique.length) return;
    if (this.prewarmUrl !== url) {
      this.clearPagePrewarm();
      this.prewarmUrl = url;
    }
    const known = new Set(this.prewarmPages);
    for (const page of unique) {
      if (!known.has(page)) this.prewarmPages.push(page);
    }
    void this.warmDocument(url);
    if (this.pagePrewarmEnabled) this.schedulePrewarm();
  }

  warm(url: string): void {
    if (!url.startsWith("/__workspace/original-pdf?")) return;
    void this.warmDocument(url);
  }

  open(url: string, page: number, count: number): void {
    if (!url.startsWith("/__workspace/original-pdf?") ||
      !Number.isSafeInteger(page) || !Number.isSafeInteger(count) ||
      page < 1 || page > count) {
      this.fail("PDF 原页定位未经验证");
      return;
    }
    this.stopActivePrewarmRequest();
    this.enabled = true;
    this.auditRegion = undefined;
    this.marker.hidden = true;
    this.stage.removeAttribute("data-focus-page");
    this.total = count;
    if (this.source !== url) {
      this.zoom = 1;
      this.adjacentImages.clear();
      this.source = url;
      this.pagePrewarmEnabled = false;
      this.updateScale();
    }
    this.page = page;
    this.loadPage();
  }

  close(): void {
    this.requestId += 1;
    this.enabled = false;
    this.source = "";
    this.auditRegion = undefined;
    this.marker.hidden = true;
    this.stage.removeAttribute("data-focus-page");
    this.page = this.total = 0;
    this.zoom = 1;
    this.image.onload = this.image.onerror = null;
    this.adjacentImages.clear();
    this.image.removeAttribute("src");
    this.image.style.visibility = "hidden";
    this.art.style.width = "100%";
    this.stage.removeAttribute("data-rendered-page");
    this.status.textContent = "";
    this.stopPrewarm();
    this.refreshControls();
  }

  private changePage(delta: number): void {
    if (!this.enabled) return;
    const page = this.page + delta;
    if (page < 1 || page > this.total) return;
    this.page = page;
    this.loadPage();
  }

  private changeZoom(multiplier: number): void {
    if (!this.enabled) return;
    const next = Math.max(0.6, Math.min(3, this.zoom * multiplier));
    if (next === this.zoom) return;
    this.zoom = next;
    this.updateScale();
    this.refreshControls();
  }

  private loadPage(): void {
    const id = ++this.requestId;
    const requestedPage = this.page;
    this.stage.removeAttribute("data-rendered-page");
    this.stage.removeAttribute("data-focus-page");
    this.marker.hidden = true;
    this.image.style.visibility = "hidden";
    this.status.textContent = "正在显示原 PDF 第 " + requestedPage + " 页…";
    this.refreshControls();

    this.image.onload = () => {
      if (id !== this.requestId || !this.enabled) return;
      if (this.image.naturalWidth < 100 || this.image.naturalHeight < 100) {
        this.fail("PDF 页图像大小异常");
        return;
      }
      this.stage.dataset.renderedPage = String(requestedPage);
      this.image.style.visibility = "visible";
      this.stage.scrollTop = this.stage.scrollLeft = 0;
      this.displayAuditRegion(true);
      this.status.textContent = "第 " + requestedPage + " 页已显示";
      // Only the two neighboring pages are fetched in the background.
      // The browser retains the decoded images while HTTP cache retains
      // the responses; no bulk whole-book render or pagination scan.
      this.prefetchAdjacent(requestedPage);
      this.prewarmedPages.add(requestedPage);
      this.pagePrewarmEnabled = true;
      this.schedulePrewarm();
    };
    this.image.onerror = () => {
      if (id === this.requestId && this.enabled) {
        this.fail("原 PDF 页加载失败，请重选审计项再试");
      }
    };
    this.image.src =
      this.prewarmedObjectUrls.get(requestedPage) ?? this.pageUrl(requestedPage);
  }

  private pageUrl(page: number): string {
    return this.pageUrlFor(this.source, page);
  }

  private pageUrlFor(source: string, page: number): string {
    return source.replace(
      "/__workspace/original-pdf?", "/__workspace/original-pdf/page?",
    ) + "&page=" + page;
  }

  private prefetchAdjacent(center: number): void {
    if (!this.enabled || this.page !== center) return;
    const nearby = [center - 1, center + 1].filter(
      (page) => page >= 1 && page <= this.total,
    );
    // Release earlier neighbors; cap retained page images to exactly two.
    for (const [page, image] of this.adjacentImages) {
      if (!nearby.includes(page)) {
        image.onload = image.onerror = null;
        this.adjacentImages.delete(page);
      }
    }
    for (const page of nearby) {
      if (this.adjacentImages.has(page)) continue;
      const image = new Image();
      image.decoding = "async";
      image.onerror = () => this.adjacentImages.delete(page);
      this.adjacentImages.set(page, image);
      image.src = this.pageUrl(page);
    }
  }

  private schedulePrewarm(): void {
    if (!this.pagePrewarmEnabled || !this.prewarmUrl ||
      this.prewarmController || this.prewarmTimer) return;
    this.prewarmTimer = window.setTimeout(() => {
      this.prewarmTimer = undefined;
      void this.runPrewarm();
    }, this.enabled ? 250 : 700);
  }

  private async runPrewarm(): Promise<void> {
    if (!this.prewarmUrl || this.prewarmController) return;
    const next = this.prewarmPages.find((page) =>
      !this.prewarmedPages.has(page) && page !== this.page);
    if (!next) return;
    const controller = new AbortController();
    this.prewarmController = controller;
    try {
      const response = await fetch(this.pageUrlFor(this.prewarmUrl, next), {
        cache: "force-cache",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) return;
      const blob = await response.blob();
      if (!controller.signal.aborted) {
        const previous = this.prewarmedObjectUrls.get(next);
        if (previous) URL.revokeObjectURL(previous);
        this.prewarmedObjectUrls.set(next, URL.createObjectURL(blob));
        this.prewarmedPages.add(next);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.warn("PDF audit prewarm failed", error);
      }
    } finally {
      if (this.prewarmController === controller) {
        this.prewarmController = undefined;
      }
      if (!controller.signal.aborted) {
        this.prewarmTimer = window.setTimeout(() => {
          this.prewarmTimer = undefined;
          void this.runPrewarm();
        }, 20);
      }
    }
  }

  private stopActivePrewarmRequest(): void {
    this.prewarmController?.abort();
    this.prewarmController = undefined;
    if (this.prewarmTimer) {
      window.clearTimeout(this.prewarmTimer);
      this.prewarmTimer = undefined;
    }
  }

  private stopPrewarm(): void {
    this.clearPagePrewarm();
    this.warmController?.abort();
    this.warmController = undefined;
    this.warmKey = "";
    this.prewarmUrl = "";
    this.pagePrewarmEnabled = false;
  }

  private clearPagePrewarm(): void {
    this.stopActivePrewarmRequest();
    this.prewarmPages = [];
    this.prewarmedPages.clear();
    for (const url of this.prewarmedObjectUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.prewarmedObjectUrls.clear();
    this.pagePrewarmEnabled = false;
  }

  private async warmDocument(source: string): Promise<void> {
    const key = pdfSourceKey(source);
    if (this.warmController && this.warmKey === key) return;
    if (this.warmController && this.warmKey !== key) {
      this.warmController.abort();
      this.warmController = undefined;
    }
    const controller = new AbortController();
    this.warmController = controller;
    this.warmKey = key;
    let ready = false;
    const url = source.replace(
      "/__workspace/original-pdf?", "/__workspace/original-pdf/warm?",
    );
    try {
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      await response.json();
      ready = true;
    } catch (error) {
      if (!controller.signal.aborted) {
        console.warn("PDF document warmup failed", error);
      }
    } finally {
      if (this.warmController === controller) {
        this.warmController = undefined;
      }
      if (ready && this.prewarmUrl) {
        this.pagePrewarmEnabled = true;
        this.schedulePrewarm();
      }
    }
  }

  private updateScale(): void {
    this.art.style.width = Math.round(this.zoom * 100) + "%";
    this.displayAuditRegion(false);
  }

  /** OCR boxes are in the JSON page's top-left coordinate system. */
  focusAuditRegion(page: number, printed?: number, bbox?: number[],
    pageSize?: number[], footnote = false): void {
    this.auditRegion = { page, printed, bbox, pageSize, footnote };
    if (this.page === page && footnote && bbox && pageSize) {
      this.zoom = Math.max(this.zoom, 1.4);
      this.updateScale();
    }
    this.displayAuditRegion(true);
    this.refreshControls();
  }

  private displayAuditRegion(scrollToMarker: boolean): void {
    const focus = this.auditRegion;
    const samePage = this.enabled && focus?.page === this.page;
    const bbox = samePage ? focus.bbox : undefined;
    const size = samePage ? focus.pageSize : undefined;
    this.marker.hidden = true;
    this.stage.removeAttribute("data-focus-page");
    if (!bbox || !size || bbox.length !== 4 || size.length !== 2 ||
      !this.image.complete || this.image.naturalWidth < 100) return;
    this.marker.style.left = (bbox[0] / size[0] * 100) + "%";
    this.marker.style.top = (bbox[1] / size[1] * 100) + "%";
    this.marker.style.width = ((bbox[2] - bbox[0]) / size[0] * 100) + "%";
    this.marker.style.height = ((bbox[3] - bbox[1]) / size[1] * 100) + "%";
    this.marker.hidden = false;
    this.stage.dataset.focusPage = String(this.page);
    if (scrollToMarker) {
      const region = this.marker.getBoundingClientRect();
      const view = this.stage.getBoundingClientRect();
      this.stage.scrollTop += region.top + region.height / 2 -
        view.top - view.height * .62;
      this.stage.scrollLeft += region.left + region.width / 2 -
        view.left - view.width * .5;
    }
  }

  private fail(message: string): void {
    this.stage.removeAttribute("data-rendered-page");
    this.image.style.visibility = "hidden";
    this.status.textContent = message;
  }

  private refreshControls(): void {
    const printed = this.auditRegion?.page === this.page
      ? this.auditRegion.printed : undefined;
    this.label.textContent = this.enabled
      ? "PDF 物理页 " + this.page + "/" + this.total
        + (printed ? " · 书页 " + printed : "") : "原 PDF";
    this.prev.disabled = !this.enabled || this.page <= 1;
    this.next.disabled = !this.enabled || this.page >= this.total;
    this.smaller.disabled = !this.enabled || this.zoom <= 0.6;
    this.larger.disabled = !this.enabled || this.zoom >= 3;
  }
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing #" + id);
  return element as T;
}

function pdfSourceKey(source: string): string {
  try {
    return new URL(source, window.location.href).searchParams.get("chapterId")
      ?? source;
  } catch {
    return source;
  }
}
