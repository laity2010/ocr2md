export class FeatureDebugMenu {
  constructor(
    private readonly toggle: HTMLButtonElement,
    private readonly menu: HTMLElement,
  ) {
    this.toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (this.toggle.disabled) return;
      this.setOpen(this.menu.hidden);
    });

    this.menu.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", () => this.close());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close();
    });

    this.setOpen(false);
  }

  setEnabled(enabled: boolean): void {
    this.toggle.disabled = !enabled;
    this.toggle.setAttribute("aria-disabled", enabled ? "false" : "true");
    if (!enabled) this.close();
  }

  close(): void {
    this.setOpen(false);
  }

  private setOpen(open: boolean): void {
    this.menu.hidden = !open;
    this.toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }
}
