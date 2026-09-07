export type DeviceDebugRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DeviceDebugElement = {
  tag: string;
  id: string;
  role: string;
  type: string;
  name: string;
  ariaLabel: string;
  text: string;
  disabled: boolean;
  visible: boolean;
  rect: DeviceDebugRect;
};

export type DeviceDebugInteraction = {
  type: string;
  at: string;
  x?: number;
  y?: number;
  pointerType?: string;
  target?: DeviceDebugElement;
};

export type DeviceDebugFailure = {
  type: "javascript" | "resource" | "promise" | "network";
  at: string;
  source?: string;
  line?: number;
  column?: number;
  errorType?: string;
  method?: string;
  status?: number;
};

export type DeviceDebugLayoutStyle = {
  display: string;
  visibility: string;
  opacity: string;
  color: string;
  backgroundColor: string;
  zIndex: string;
  transform: string;
  filter: string;
  pointerEvents: string;
};

export type DeviceDebugLayoutProbe = {
  name: string;
  element: DeviceDebugElement | null;
  style: DeviceDebugLayoutStyle | null;
  pointStack: DeviceDebugElement[];
};

export type DeviceDebugSnapshot = {
  bridgeVersion: 2;
  sessionId: string;
  installed: boolean;
  sequence: number;
  visibility: DocumentVisibilityState;
  focused: boolean;
  viewport: {
    innerWidth: number;
    innerHeight: number;
    scrollX: number;
    scrollY: number;
    documentWidth: number;
    documentHeight: number;
    visualViewport: null | {
      width: number;
      height: number;
      offsetLeft: number;
      offsetTop: number;
      pageLeft: number;
      pageTop: number;
      scale: number;
    };
  };
  activeElement: DeviceDebugElement | null;
  interactiveElements: DeviceDebugElement[];
  layoutProbes: DeviceDebugLayoutProbe[];
  lastInteraction: DeviceDebugInteraction | null;
  lastFailure: DeviceDebugFailure | null;
};

export type DeviceDebugReporter = (event: string) => void;

const MAX_INTERACTIVE_ELEMENTS = 120;
const SCROLL_REPORT_DELAY_MS = 300;
const EXCLUDED_NETWORK_PATHS = new Set([
  "/__debug/runtime",
  "/__debug/state",
  "/__debug/command"
]);

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function sanitizeDebugUrl(input: string, baseHref?: string): string {
  try {
    const url = new URL(
      input,
      baseHref ?? (typeof location !== "undefined" ? location.href : "https://debug.invalid/")
    );
    return url.origin + url.pathname;
  } catch {
    return "invalid-url";
  }
}

function elementText(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    tag === "option"
  ) {
    return "";
  }

  return (element.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function describeDebugElement(
  element: Element | null
): DeviceDebugElement | null {
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const tag = element.tagName.toLowerCase();
  const inputLike =
    element instanceof HTMLInputElement ||
    element instanceof HTMLButtonElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement;

  return {
    tag,
    id: element.id || "",
    role: element.getAttribute("role") || "",
    type: inputLike && "type" in element ? String(element.type || "") : "",
    name: inputLike && "name" in element ? String(element.name || "") : "",
    ariaLabel: element.getAttribute("aria-label") || "",
    text: elementText(element),
    disabled: "disabled" in element
      ? Boolean((element as HTMLButtonElement).disabled)
      : false,
    visible:
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || "1") > 0,
    rect: {
      x: rounded(rect.x),
      y: rounded(rect.y),
      width: rounded(rect.width),
      height: rounded(rect.height)
    }
  };
}

function collectInteractiveElements(): DeviceDebugElement[] {
  const selector = [
    "button",
    "a[href]",
    "input",
    "select",
    "textarea",
    "[role='button']",
    "[role='link']",
    "[tabindex]"
  ].join(",");

  return Array.from(document.querySelectorAll(selector))
    .slice(0, MAX_INTERACTIVE_ELEMENTS)
    .map((element) => describeDebugElement(element))
    .filter((element): element is DeviceDebugElement => Boolean(element));
}


function layoutStyle(element: Element | null): DeviceDebugLayoutStyle | null {
  if (!element) return null;
  const style = getComputedStyle(element);
  return {
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    color: style.color,
    backgroundColor: style.backgroundColor,
    zIndex: style.zIndex,
    transform: style.transform,
    filter: style.filter,
    pointerEvents: style.pointerEvents
  };
}

function layoutProbe(name: string, element: Element | null): DeviceDebugLayoutProbe {
  if (!element) {
    return { name, element: null, style: null, pointStack: [] };
  }

  const rect = element.getBoundingClientRect();
  const x = Math.min(
    Math.max(rect.left + Math.min(rect.width / 2, 120), 0),
    Math.max(window.innerWidth - 1, 0)
  );
  const y = Math.min(
    Math.max(rect.top + Math.min(rect.height / 2, 20), 0),
    Math.max(window.innerHeight - 1, 0)
  );

  return {
    name,
    element: describeDebugElement(element),
    style: layoutStyle(element),
    pointStack: document.elementsFromPoint(x, y)
      .slice(0, 8)
      .map((candidate) => describeDebugElement(candidate))
      .filter((candidate): candidate is DeviceDebugElement => Boolean(candidate))
  };
}

function collectLayoutProbes(): DeviceDebugLayoutProbe[] {
  return [
    layoutProbe("calibration-grid", document.querySelector("#calibration-grid")),
    layoutProbe(
      "calibration-header",
      document.querySelector("#calibration-grid .ag-header")
    ),
    layoutProbe(
      "calibration-first-row",
      document.querySelector("#calibration-grid .ag-row")
    ),
    layoutProbe(
      "grid-pane",
      document.querySelector(".grid-pane")
    )
  ];
}

function failureType(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  if (error && typeof error === "object") {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name) return name.slice(0, 80);
  }
  return typeof error;
}

export function createDeviceDebugBridge(): {
  install: (report: DeviceDebugReporter) => void;
  snapshot: () => DeviceDebugSnapshot;
} {
  let installed = false;
  let sequence = 0;
  const sessionId = (() => {
    const storageKey = "__device_debug_session_id__";
    try {
      const existing = sessionStorage.getItem(storageKey);
      if (existing) return existing;
      const created =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : "device-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
      sessionStorage.setItem(storageKey, created);
      return created;
    } catch {
      return "device-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    }
  })();
  let reporter: DeviceDebugReporter | null = null;
  let lastInteraction: DeviceDebugInteraction | null = null;
  let lastFailure: DeviceDebugFailure | null = null;
  let scrollTimer: number | undefined;
  let originalFetch: typeof window.fetch | null = null;

  const emit = (event: string) => {
    sequence += 1;
    reporter?.(event);
  };

  const scheduleViewportReport = (event: string) => {
    if (scrollTimer !== undefined) {
      window.clearTimeout(scrollTimer);
    }
    scrollTimer = window.setTimeout(() => {
      scrollTimer = undefined;
      emit(event);
    }, SCROLL_REPORT_DELAY_MS);
  };

  const snapshot = (): DeviceDebugSnapshot => {
    const root = document.documentElement;
    const body = document.body;
    const visual = window.visualViewport;

    return {
      bridgeVersion: 2,
      sessionId,
      installed,
      sequence,
      visibility: document.visibilityState,
      focused: document.hasFocus(),
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollX: rounded(window.scrollX),
        scrollY: rounded(window.scrollY),
        documentWidth: Math.max(
          root?.scrollWidth ?? 0,
          body?.scrollWidth ?? 0
        ),
        documentHeight: Math.max(
          root?.scrollHeight ?? 0,
          body?.scrollHeight ?? 0
        ),
        visualViewport: visual
          ? {
              width: rounded(visual.width),
              height: rounded(visual.height),
              offsetLeft: rounded(visual.offsetLeft),
              offsetTop: rounded(visual.offsetTop),
              pageLeft: rounded(visual.pageLeft),
              pageTop: rounded(visual.pageTop),
              scale: rounded(visual.scale)
            }
          : null
      },
      activeElement: describeDebugElement(document.activeElement),
      interactiveElements: collectInteractiveElements(),
      layoutProbes: collectLayoutProbes(),
      lastInteraction,
      lastFailure
    };
  };

  const install = (report: DeviceDebugReporter) => {
    if (installed) return;
    installed = true;
    reporter = report;

    document.addEventListener(
      "pointerdown",
      (event) => {
        lastInteraction = {
          type: "pointerdown",
          at: new Date().toISOString(),
          x: rounded(event.clientX),
          y: rounded(event.clientY),
          pointerType: event.pointerType || "",
          target: describeDebugElement(
            event.target instanceof Element ? event.target : null
          ) ?? undefined
        };
        emit("device_pointerdown");
      },
      { capture: true, passive: true }
    );

    document.addEventListener(
      "click",
      (event) => {
        lastInteraction = {
          type: "click",
          at: new Date().toISOString(),
          x: rounded(event.clientX),
          y: rounded(event.clientY),
          target: describeDebugElement(
            event.target instanceof Element ? event.target : null
          ) ?? undefined
        };
        emit("device_click");
      },
      true
    );

    document.addEventListener(
      "focusin",
      () => emit("device_focus"),
      true
    );

    window.addEventListener(
      "scroll",
      () => scheduleViewportReport("device_scroll"),
      { capture: true, passive: true }
    );
    document.addEventListener(
      "scroll",
      () => scheduleViewportReport("device_scroll"),
      { capture: true, passive: true }
    );
    document.addEventListener(
      "touchend",
      () => scheduleViewportReport("device_viewport_after_touch"),
      { capture: true, passive: true }
    );
    document.addEventListener(
      "pointercancel",
      () => scheduleViewportReport("device_viewport_after_pointer_cancel"),
      { capture: true, passive: true }
    );
    window.addEventListener(
      "resize",
      () => scheduleViewportReport("device_resize"),
      { passive: true }
    );
    window.addEventListener(
      "orientationchange",
      () => scheduleViewportReport("device_orientation"),
      { passive: true }
    );

    visualViewport?.addEventListener(
      "resize",
      () => scheduleViewportReport("device_visual_viewport"),
      { passive: true }
    );
    visualViewport?.addEventListener(
      "scroll",
      () => scheduleViewportReport("device_visual_viewport"),
      { passive: true }
    );

    document.addEventListener("visibilitychange", () => {
      emit("device_visibility");
    });

    window.addEventListener(
      "error",
      (event) => {
        const target = event.target;
        if (
          target instanceof HTMLImageElement ||
          target instanceof HTMLScriptElement ||
          target instanceof HTMLLinkElement
        ) {
          const source =
            target instanceof HTMLLinkElement
              ? target.href
              : target.src;
          lastFailure = {
            type: "resource",
            at: new Date().toISOString(),
            source: sanitizeDebugUrl(source)
          };
          emit("device_resource_error");
          return;
        }

        lastFailure = {
          type: "javascript",
          at: new Date().toISOString(),
          source: event.filename
            ? sanitizeDebugUrl(event.filename)
            : undefined,
          line: event.lineno || undefined,
          column: event.colno || undefined,
          errorType: failureType(event.error)
        };
        emit("device_javascript_error");
      },
      true
    );

    window.addEventListener("unhandledrejection", (event) => {
      lastFailure = {
        type: "promise",
        at: new Date().toISOString(),
        errorType: failureType(event.reason)
      };
      emit("device_unhandled_rejection");
    });

    originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const method =
        (init?.method || (input instanceof Request ? input.method : "GET"))
          .toUpperCase();
      const rawUrl =
        input instanceof Request ? input.url : String(input);
      let path = "";
      try {
        path = new URL(rawUrl, location.href).pathname;
      } catch {
        path = "";
      }

      try {
        const response = await originalFetch!(input, init);
        if (
          response.status >= 400 &&
          !EXCLUDED_NETWORK_PATHS.has(path)
        ) {
          lastFailure = {
            type: "network",
            at: new Date().toISOString(),
            source: sanitizeDebugUrl(rawUrl, location.href),
            method,
            status: response.status
          };
          emit("device_network_http_error");
        }
        return response;
      } catch (error) {
        if (!EXCLUDED_NETWORK_PATHS.has(path)) {
          lastFailure = {
            type: "network",
            at: new Date().toISOString(),
            source: sanitizeDebugUrl(rawUrl, location.href),
            method,
            errorType: failureType(error)
          };
          emit("device_network_failure");
        }
        throw error;
      }
    };

    emit("device_bridge_installed");
  };

  return {
    install,
    snapshot
  };
}
