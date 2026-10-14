import { ItemView, Notice, Plugin, TFolder, TFile, WorkspaceLeaf } from "obsidian";
import { EXPECTED_VAULT, WORK_AREA, isTargetVault, isProtectedPath, testNotePath } from "./pathGuards";

const VIEW_TYPE = "ocr2md-v3-real-vault-root";

/** All access uses Obsidian's CURRENT app.vault, not a mirrored Mac path or IndexedDB. */
class VaultProbeView extends ItemView {
  private current: TFolder | null = null;
  private consent?: HTMLInputElement;

  constructor(leaf: WorkspaceLeaf) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "ocr2md v3 · 真库 Root"; }
  getIcon(): string { return "folder-search"; }

  async onOpen(): Promise<void> {
    this.current = this.app.vault.getRoot();
    await this.render();
  }
  async onClose(): Promise<void> {
    this.contentEl.empty();
    this.current = null;
  }
  private async render(): Promise<void> {
    const root = this.app.vault.getRoot();
    const vault = this.app.vault;
    const el = this.contentEl;
    el.empty();
    el.addClass("ocr2md-v3-vault-probe");
    el.createEl("h3", { text: "ocr2md v3 · 实际 Obsidian 库" });
    el.createEl("p", { text: `当前真实 Vault：${vault.getName()}（来自 iPad Obsidian 自己的 Vault API）` });
    el.createEl("p", { text: "Root = 当前打开的 Obsidian 库根目录 /；清洗区 = /ocr2md/" });
    el.createEl("p", { text: "本页不读取 Safari IndexedDB，不连接 Mac 或 GD，不执行自动删除或批量写入。" });
    const target = isTargetVault(vault.getName());
    if (!target) {
      el.createEl("p", { text: `未连接目标库：请先在 Obsidian 切换到名为 ${EXPECTED_VAULT} 的库。` });
    }
    const folder = this.current ?? root;
    const breadcrumb = el.createDiv();
    breadcrumb.setText(`当前位置：/${folder.path === "/" ? "" : folder.path}`);
    const top = el.createDiv();
    const rootButton = top.createEl("button", { text: "返回 Vault Root /" });
    rootButton.addEventListener("click", () => { this.current = root; void this.render(); });
    const parentButton = top.createEl("button", { text: "返回上一级" });
    parentButton.disabled = folder === root;
    parentButton.addEventListener("click", () => {
      this.current = folder.parent instanceof TFolder ? folder.parent : root;
      void this.render();
    });

    const rows = el.createDiv();
    rows.createEl("h4", { text: "库中真实目录与文件（只读列举）" });
    for (const child of [...folder.children].sort((a, b) => {
      if ((a instanceof TFolder) !== (b instanceof TFolder)) return a instanceof TFolder ? -1 : 1;
      return a.name.localeCompare(b.name, "zh-CN");
    })) {
      if (isProtectedPath(child.path, vault.configDir)) continue;
      const row = rows.createDiv();
      if (child instanceof TFolder) {
        const btn = row.createEl("button", { text: `📁 ${child.name}/` });
        btn.addEventListener("click", () => { this.current = child; void this.render(); });
      } else if (child instanceof TFile) {
        const btn = row.createEl("button", { text: `📄 ${child.name}` });
        btn.addEventListener("click", async () => {
          await this.app.workspace.getLeaf(true).openFile(child);
        });
      }
    }

    const workDir = vault.getFolderByPath(WORK_AREA);
    const probe = el.createDiv();
    probe.createEl("h4", { text: "真实文件写入/读回验收" });
    if (!workDir) {
      probe.createEl("p", { text: "没有发现 /ocr2md/ 清洗工作目录；不会自动创建或写入，请确认实际库结构。" });
      return;
    }
    probe.createEl("p", { text: "点击验收将仅在 /ocr2md/ 下创建唯一名称的 Markdown 测试文件；不会修改任何已有文件。" });
    const label = probe.createEl("label");
    this.consent = document.createElement("input");
    this.consent.type = "checkbox";
    label.appendChild(this.consent);
    label.appendText(" 我确认在真实 Obsidian 库创建一份新验证文件");
    const result = probe.createDiv();
    const writeButton = probe.createEl("button", { text: "写入并读回真实文件" });
    writeButton.disabled = !target;
    writeButton.addEventListener("click", async () => {
      if (!target || !this.consent?.checked) {
        new Notice("先勾选真实文件写入确认");
        return;
      }
      writeButton.disabled = true;
      try {
        const path = testNotePath(Date.now());
        if (vault.getAbstractFileByPath(path)) throw new Error("验证文件已经存在，取消写入");
        const expected = `# ocr2md iPad Vault Root 写入验收\n\n来源：Obsidian Mobile 插件\nVault: ${vault.getName()}\nPath: ${path}\n`;
        const file = await vault.create(path, expected); // create never replaces an existing note.
        const reread = await vault.read(file);
        if (reread !== expected) throw new Error("真实文件读回内容不一致");
        result.setText(`真实库写入和读回成功：${path}。请在 Obsidian 文件树或 Mac/iCloud 检查此文件。`);
        new Notice("ocr2md 真库文件读写一致");
        this.current = workDir;
      } catch (err) {
        result.setText("验收失败：" + String(err));
      } finally {
        writeButton.disabled = false;
      }
    });
  }
}

export default class OCR2MDVaultProbePlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(VIEW_TYPE, leaf => new VaultProbeView(leaf));
    this.addRibbonIcon("folder-search", "ocr2md v3 真库 Root", () => { void this.activate(); });
    this.addCommand({ id: "open-ocr2md-v3-real-vault-root", name: "打开真实 Obsidian Vault Root 验收", callback: () => { void this.activate(); } });
  }
  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
  private async activate(): Promise<void> {
    const workspace = this.app.workspace;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
}
