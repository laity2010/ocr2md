export type SourceRegexMatch = {
  from: number;
  to: number;
};

type SourceRegexSearchOptions = {
  input: HTMLInputElement;
  caseToggle: HTMLInputElement;
  previousButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  status: HTMLElement;
  reveal: (match: SourceRegexMatch) => void;
  highlight?: (
    matches: readonly SourceRegexMatch[],
    currentIndex: number,
  ) => void;
};

export class SourceRegexSearch {
  private text = "";
  private reveal: (match: SourceRegexMatch) => void;
  private highlight:
    | ((matches: readonly SourceRegexMatch[], currentIndex: number) => void)
    | undefined;
  private currentText: (() => string) | undefined;
  private matches: SourceRegexMatch[] = [];
  private index = -1;

  constructor(private readonly options: SourceRegexSearchOptions) {
    this.reveal = options.reveal;
    this.highlight = options.highlight;
    options.input.addEventListener("input", () => this.recalculate(true));
    options.input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      this.move(event.shiftKey ? -1 : 1);
    });
    options.caseToggle.addEventListener("change", () => this.recalculate(true));
    options.previousButton.addEventListener("click", () => this.move(-1));
    options.nextButton.addEventListener("click", () => this.move(1));
    this.syncControls();
  }

  updateTarget(
    text: string,
    reveal: (match: SourceRegexMatch) => void,
    currentText?: () => string,
    highlight?: (
      matches: readonly SourceRegexMatch[],
      currentIndex: number,
    ) => void,
  ): void {
    this.highlight?.([], -1);
    this.text = text;
    this.reveal = reveal;
    this.currentText = currentText;
    this.highlight = highlight;
    this.recalculate(true);
  }

  updateText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.recalculate(false);
  }

  clearHighlight(): void {
    this.highlight?.([], -1);
  }

  reset(): void {
    this.options.input.value = "";
    this.options.caseToggle.checked = false;
    this.matches = [];
    this.index = -1;
    this.options.input.removeAttribute("aria-invalid");
    this.options.status.textContent = "";
    this.syncHighlight();
    this.syncControls();
  }

  private recalculate(resetIndex: boolean): void {
    if (this.currentText) this.text = this.currentText();
    const pattern = this.options.input.value;
    if (!pattern) {
      this.matches = [];
      this.index = -1;
      this.options.input.removeAttribute("aria-invalid");
      this.options.status.textContent = "";
      this.syncHighlight();
      this.syncControls();
      return;
    }

    try {
      const flags = "gmu" + (this.options.caseToggle.checked ? "" : "i");
      const regex = new RegExp(pattern, flags);
      const nextMatches: SourceRegexMatch[] = [];

      for (;;) {
        const match = regex.exec(this.text);
        if (!match) break;
        nextMatches.push({
          from: match.index,
          to: match.index + match[0].length,
        });
        if (match[0].length === 0) {
          regex.lastIndex += 1;
        }
      }

      this.matches = nextMatches;
      if (resetIndex) {
        this.index = this.matches.length ? 0 : -1;
      } else if (this.index >= this.matches.length) {
        this.index = this.matches.length ? this.matches.length - 1 : -1;
      }

      this.options.input.removeAttribute("aria-invalid");
      this.syncStatus();
      this.syncHighlight();
      this.syncControls();
      if (resetIndex && this.index >= 0) this.revealCurrent();
    } catch (error) {
      this.matches = [];
      this.index = -1;
      this.options.input.setAttribute("aria-invalid", "true");
      this.options.status.textContent =
        "正则错误：" + (error instanceof Error ? error.message : String(error));
      this.syncHighlight();
      this.syncControls();
    }
  }

  private move(direction: -1 | 1): void {
    if (!this.matches.length) return;
    this.index =
      (this.index + direction + this.matches.length) % this.matches.length;
    this.syncStatus();
    this.syncHighlight();
    this.revealCurrent();
  }

  private revealCurrent(): void {
    const match = this.matches[this.index];
    if (!match) return;
    this.reveal(match);
  }

  private syncHighlight(): void {
    this.highlight?.(this.matches, this.index);
  }

  private syncStatus(): void {
    if (!this.matches.length) {
      this.options.status.textContent = "0 个匹配";
      return;
    }
    this.options.status.textContent =
      String(this.matches.length)
      + " 个匹配 · "
      + String(this.index + 1)
      + "/"
      + String(this.matches.length);
  }

  private syncControls(): void {
    const disabled = this.matches.length === 0;
    this.options.previousButton.disabled = disabled;
    this.options.nextButton.disabled = disabled;
  }
}
