export type FeatureDebugActionResult = void | boolean | Promise<void | boolean>;

export function requireFeatureDebug(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

export type FeatureDebugStep = {
  label: string;
  run: () => FeatureDebugActionResult;
};

export type FeatureDebugRegistration = {
  id: string;
  title: string;
  button: HTMLButtonElement;
  beforeRun?: () => void | Promise<void>;
  run?: () => FeatureDebugActionResult;
  steps?: () => readonly FeatureDebugStep[];
  enabled?: () => boolean;
  onSuccess?: () => void;
  onFailure?: (error: Error) => void;
};

type FeatureDebugState = {
  completed: boolean;
  running: boolean;
};

type FeatureDebugRunnerOptions = {
  progress: HTMLElement;
  progressTitle: HTMLElement;
  progressList: HTMLElement;
  delayMs: () => number;
  completionHideDelayMs: () => number;
};

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class FeatureDebugRunner {
  private readonly registrations = new Map<string, FeatureDebugRegistration>();
  private readonly states = new Map<string, FeatureDebugState>();
  private progressHideTimer: number | undefined;

  constructor(private readonly options: FeatureDebugRunnerOptions) {}

  register(registration: FeatureDebugRegistration): void {
    if (this.registrations.has(registration.id)) {
      throw new Error(`duplicate feature debug id: ${registration.id}`);
    }
    if (Boolean(registration.run) === Boolean(registration.steps)) {
      throw new Error(
        `feature debug ${registration.id} must define exactly one of run or steps`,
      );
    }

    this.registrations.set(registration.id, registration);
    this.states.set(registration.id, { completed: false, running: false });
    registration.button.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.execute(registration.id);
    });
    this.syncButton(registration.id);
  }

  reset(): void {
    this.clearProgressHideTimer();
    for (const state of this.states.values()) {
      state.completed = false;
      state.running = false;
    }
    this.options.progress.hidden = false;
    this.setProgressOpen(false);
    if (!this.options.progressTitle.textContent) {
      this.options.progress.dataset.state = "empty";
      this.options.progressTitle.textContent = "尚无调试记录";
      this.options.progressList.replaceChildren();
    }
    this.refreshControls();
  }

  refreshControls(): void {
    for (const id of this.registrations.keys()) this.syncButton(id);
  }

  private syncButton(id: string): void {
    const registration = this.registrations.get(id);
    const state = this.states.get(id);
    if (!registration || !state) return;
    registration.button.disabled =
      state.completed
      || state.running
      || registration.enabled?.() === false;
    registration.button.setAttribute(
      "aria-disabled",
      registration.button.disabled ? "true" : "false",
    );
  }

  private async execute(id: string): Promise<void> {
    const registration = this.registrations.get(id);
    const state = this.states.get(id);
    if (!registration || !state || state.completed || state.running) return;

    state.running = true;
    this.syncButton(id);

    let currentStep = 0;
    let stepNodes: HTMLElement[] = [];
    try {
      await registration.beforeRun?.();

      if (registration.steps) {
        const steps = registration.steps();
        stepNodes = this.prepareProgress(registration.title, steps);
        for (let index = 0; index < steps.length; index += 1) {
          currentStep = index;
          this.setStep(stepNodes, steps, registration.title, index, "current");
          const result = await steps[index].run();
          if (result === false) return;
          this.setStep(stepNodes, steps, registration.title, index, "done");
          if (index < steps.length - 1) await this.delay();
        }
        this.options.progress.dataset.state = "passed";
        this.options.progressTitle.textContent =
          `${registration.title}功能调试 · ${steps.length}/${steps.length} 通过`;
        this.scheduleProgressHide();
      } else {
        const result = await registration.run?.();
        if (result === false) return;
      }

      state.completed = true;
      registration.onSuccess?.();
    } catch (error) {
      const normalized = asError(error);
      if (registration.steps) {
        const steps = registration.steps();
        this.setStep(
          stepNodes,
          steps,
          registration.title,
          currentStep,
          "failed",
        );
        const failedStep = stepNodes[currentStep];
        if (failedStep) {
          failedStep.dataset.error = normalized.message;
          failedStep.title = normalized.message;
          failedStep.textContent += " · " + normalized.message;
        }
        this.options.progress.dataset.state = "failed";
        this.options.progressTitle.textContent =
          `${registration.title}功能调试 · 失败`;
      }
      registration.onFailure?.(normalized);
    } finally {
      state.running = false;
      this.syncButton(id);
    }
  }

  private prepareProgress(
    title: string,
    steps: readonly FeatureDebugStep[],
  ): HTMLElement[] {
    this.clearProgressHideTimer();
    this.options.progressList.replaceChildren();
    this.options.progress.hidden = false;
    this.setProgressOpen(true);
    this.options.progress.dataset.state = "running";
    this.options.progressTitle.textContent =
      `${title}功能调试 · 0/${steps.length}`;

    return steps.map((step, index) => {
      const node = document.createElement("div");
      node.className = "feature-debug-progress-step";
      node.dataset.debugStep = String(index + 1);
      node.dataset.state = "pending";
      node.textContent = "○ " + step.label;
      this.options.progressList.append(node);
      return node;
    });
  }

  private setStep(
    nodes: HTMLElement[],
    steps: readonly FeatureDebugStep[],
    title: string,
    index: number,
    nextState: "current" | "done" | "failed",
  ): void {
    const node = nodes[index];
    const step = steps[index];
    if (!node || !step) return;
    node.dataset.state = nextState;
    const marker =
      nextState === "done" ? "✓" : nextState === "failed" ? "✕" : "→";
    node.textContent = marker + " " + step.label;
    if (nextState === "current") {
      this.options.progressTitle.textContent =
        `${title}功能调试 · ${index}/${steps.length}`;
    } else if (nextState === "done") {
      this.options.progressTitle.textContent =
        `${title}功能调试 · ${index + 1}/${steps.length}`;
    }
  }

  private delay(): Promise<void> {
    return new Promise((resolve) =>
      window.setTimeout(resolve, this.options.delayMs()),
    );
  }

  private scheduleProgressHide(): void {
    this.clearProgressHideTimer();
    this.progressHideTimer = window.setTimeout(() => {
      this.progressHideTimer = undefined;
      if (this.options.progress.dataset.state === "passed") {
        this.setProgressOpen(false);
      }
    }, this.options.completionHideDelayMs());
  }

  private setProgressOpen(open: boolean): void {
    if (this.options.progress instanceof HTMLDetailsElement) {
      this.options.progress.open = open;
    }
  }

  private clearProgressHideTimer(): void {
    if (this.progressHideTimer === undefined) return;
    window.clearTimeout(this.progressHideTimer);
    this.progressHideTimer = undefined;
  }
}
