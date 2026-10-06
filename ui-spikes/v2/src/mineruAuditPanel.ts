import type { MineruAuditPayload, MineruAuditRow, MineruAuditChange } from "../../../src/mineruAuditReviewStore";
import type { MineruMarkdownLocator } from "../../../src/mineruAnnotationContract";

/** Read-only evidence browser with separate, explicit local review decisions. */
export class MineruAuditPanel {
  private payload?: MineruAuditPayload;
  private chapterId = "";
  private loadToken = 0;
  private busy = false;

  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly summary: HTMLElement,
    private readonly rows: HTMLElement,
    private readonly kindSelect: HTMLSelectElement,
    private readonly stateSelect: HTMLSelectElement,
    private readonly search: HTMLInputElement,
    private readonly status: HTMLElement,
    private readonly onLocate: (target: MineruMarkdownLocator, row: MineruAuditRow) => void,
    private readonly onCountChange?: (payload: MineruAuditPayload) => void,
  ) {
    dialog.querySelector<HTMLButtonElement>("#mineru-audit-close")
      ?.addEventListener("click", () => this.close());
    kindSelect.addEventListener("change", () => this.render());
    stateSelect.addEventListener("change", () => this.render());
    search.addEventListener("input", () => this.render());
    dialog.addEventListener("close", () => {
      // A delayed close event from the previous opening must not cancel
      // a newer fetch if the user immediately reopens the dialog.
      if (!this.dialog.open) this.loadToken += 1;
    });
  }

  get isOpen(): boolean { return this.dialog.open; }

  close(): void {
    if (this.dialog.open) this.dialog.close();
  }

  async open(chapterId: string): Promise<void> {
    this.chapterId = chapterId;
    this.kindSelect.value = "";
    this.stateSelect.value = "待审核";
    this.search.value = "";
    this.payload = undefined;
    this.summary.textContent = "";
    this.rows.replaceChildren();
    this.status.textContent = "正在读取全书注释审计…";
    if (!this.dialog.open) this.dialog.showModal();
    await this.reload();
  }

  private async reload(): Promise<void> {
    const requestToken = ++this.loadToken;
    try {
      const response = await fetch(
        "/__workspace/chapter/annotation-audit?chapterId=" + encodeURIComponent(this.chapterId),
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await this.errorText(response));
      const payload = await response.json() as MineruAuditPayload;
      if (requestToken !== this.loadToken || !this.dialog.open) return;
      this.payload = payload;
      this.onCountChange?.(payload);
      const previousKind = this.kindSelect.value;
      this.kindSelect.replaceChildren(new Option("所有类型", ""));
      for (const kind of Object.keys(payload.kinds)) {
        this.kindSelect.add(new Option(kind + " (" + payload.kinds[kind] + ")", kind));
      }
      this.kindSelect.value = previousKind && payload.kinds[previousKind] ? previousKind : "";
      this.status.textContent = "";
      this.render();
    } catch (error) {
      if (requestToken !== this.loadToken) return;
      this.status.textContent = "无法读取审计：" + String(error);
    }
  }

  private render(): void {
    const payload = this.payload;
    if (!payload) return;
    const { counts, entries } = payload;
    this.summary.textContent =
      "全书 " + entries.length + " 项 · 待审核 " + counts["待审核"]
      + " · 已核查 " + counts["已核查"]
      + " · 疑似误报 " + counts["疑似误报"]
      + " · 源证据变化需复核 " + counts["需复核"];
    const search = this.search.value.trim().toLowerCase();
    const kind = this.kindSelect.value;
    const state = this.stateSelect.value;
    const filtered = entries.filter((item) =>
      (!kind || item.kind === kind)
      && (!state || item.state === state)
      && (!search || (
        item.documentKey + " " + item.summary + " " + item.detail
        + " " + (item.pageNumber ?? "") + " " + (item.annotationNumber ?? "")
      ).toLowerCase().includes(search)),
    );
    this.rows.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement("p");
      empty.textContent = entries.length ? "没有符合筛选条件的审计证据。" : "未发现页注释审计异常。";
      this.rows.append(empty);
      return;
    }
    for (const issue of filtered) this.rows.append(this.renderItem(issue));
  }

  private renderItem(item: MineruAuditRow): HTMLElement {
    const section = document.createElement("section");
    section.className = "mineru-audit-item";
    const heading = document.createElement("div");
    heading.className = "mineru-audit-item-title";
    const title = document.createElement("strong");
    title.textContent = item.kind + " · " + item.summary;
    const badge = document.createElement("span");
    badge.textContent = item.state;
    badge.className = "mineru-audit-review-state";
    heading.append(title, badge);
    const origin = document.createElement("div");
    origin.className = "mineru-audit-origin";
    origin.textContent =
      item.documentKey.split("/").pop()
      + (item.pageNumber !== undefined ? " · PDF 第 " + item.pageNumber + " 页" : "")
      + (item.json ? " · " + item.json.collection + "[" + item.json.blockIndex + "]" : "");
    origin.title = item.documentKey;
    const evidence = document.createElement("pre");
    evidence.textContent = item.detail;
    evidence.className = "mineru-audit-evidence";
    section.append(heading, origin, evidence);
    if (item.state === "需复核") {
      const warning = document.createElement("p");
      warning.textContent = "原始 JSON / MD / 章节发生变化。上次结论（"
        + (item.previousDecision ?? "") + "）已失效，须重新核查。";
      section.append(warning);
    }
    if (item.candidateLocations.length) {
      const options = document.createElement("div");
      options.className = "mineru-audit-candidates";
      options.textContent = "候选（仅供核对，不自动定位）："
        + item.candidateLocations.map((loc) =>
          loc.chapterPath + " 第 " + (loc.lineIndex + 1) + " 行").join("；");
      section.append(options);
    }
    const actions = document.createElement("div");
    actions.className = "mineru-audit-actions";
    if (item.navigationTargets.length) {
      const select = document.createElement("select");
      select.setAttribute("aria-label", "选择正文引用位置");
      item.navigationTargets.forEach((target, i) => {
        select.add(new Option(
          "引用 " + (i + 1) + " · " + target.chapterId
          + " 第 " + (target.lineIndex + 1) + " 行", String(i),
        ));
      });
      const jump = document.createElement("button");
      jump.type = "button";
      jump.textContent = "定位";
      jump.addEventListener("click", () => {
        const selected = item.navigationTargets[Number(select.value)];
        if (selected) this.onLocate(selected, item);
      });
      actions.append(select, jump);
    }
    const decision = document.createElement("select");
    decision.setAttribute("aria-label", "审核结论");
    for (const choice of ["待审核", "已核查", "疑似误报"]) {
      decision.add(new Option(choice, choice));
    }
    decision.value = item.state === "需复核" ? "待审核" : item.state;
    const note = document.createElement("textarea");
    note.rows = 2;
    note.maxLength = 1000;
    note.placeholder = "审核理由/查证依据（保存在 Mac 私有目录，不改原稿）";
    note.value = item.reviewNote;
    note.setAttribute("aria-label", "审核备注");
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "保存审核";
    save.addEventListener("click", () => {
      void this.save(item, decision.value as MineruAuditChange["decision"], note.value);
    });
    actions.append(decision, note, save);
    section.append(actions);
    return section;
  }

  private async save(item: MineruAuditRow, decision: MineruAuditChange["decision"], note: string): Promise<void> {
    if (!this.payload || this.busy) return;
    this.busy = true;
    this.status.textContent = "正在保存审核…";
    const change: MineruAuditChange = {
      id: item.id,
      expectedProjectId: this.payload.projectId,
      decision, note,
      sourceFingerprint: this.payload.sourceFingerprint,
      expectedRevision: this.payload.revision,
    };
    try {
      const response = await fetch("/__workspace/chapter/annotation-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId: this.chapterId, change }),
      });
      if (!response.ok) throw new Error(await this.errorText(response));
      this.payload = await response.json() as MineruAuditPayload;
      this.onCountChange?.(this.payload);
      this.status.textContent = "已保存审核。原始证据仍保留。";
      this.render();
    } catch (error) {
      this.status.textContent = "审核未写入：" + String(error);
      await this.reload();
    } finally {
      this.busy = false;
    }
  }

  private async errorText(response: Response): Promise<string> {
    try {
      const json = await response.json() as { error?: string };
      return json.error ?? "HTTP " + response.status;
    } catch {
      return "HTTP " + response.status;
    }
  }
}
