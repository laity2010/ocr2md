"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => OCR2MDVaultProbePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/pathGuards.ts
var EXPECTED_VAULT = "ocr2md";
var WORK_AREA = "ocr2md";
var TEST_FILE_PREFIX = "_wp2_vault_probe_";
function isTargetVault(name) {
  return name === EXPECTED_VAULT;
}
function isProtectedPath(path, configDir = ".obsidian") {
  const first = path.split("/")[0];
  return first === configDir || first.startsWith(".");
}
function testNotePath(timestamp) {
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) throw new Error("Invalid timestamp");
  return `${WORK_AREA}/${TEST_FILE_PREFIX}${timestamp}.md`;
}

// src/main.ts
var VIEW_TYPE = "ocr2md-v3-real-vault-root";
var VaultProbeView = class extends import_obsidian.ItemView {
  constructor(leaf) {
    super(leaf);
    __publicField(this, "current", null);
    __publicField(this, "consent");
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "ocr2md v3 \xB7 \u771F\u5E93 Root";
  }
  getIcon() {
    return "folder-search";
  }
  async onOpen() {
    this.current = this.app.vault.getRoot();
    await this.render();
  }
  async onClose() {
    this.contentEl.empty();
    this.current = null;
  }
  async render() {
    var _a;
    const root = this.app.vault.getRoot();
    const vault = this.app.vault;
    const el = this.contentEl;
    el.empty();
    el.addClass("ocr2md-v3-vault-probe");
    el.createEl("h3", { text: "ocr2md v3 \xB7 \u5B9E\u9645 Obsidian \u5E93" });
    el.createEl("p", { text: `\u5F53\u524D\u771F\u5B9E Vault\uFF1A${vault.getName()}\uFF08\u6765\u81EA iPad Obsidian \u81EA\u5DF1\u7684 Vault API\uFF09` });
    el.createEl("p", { text: "Root = \u5F53\u524D\u6253\u5F00\u7684 Obsidian \u5E93\u6839\u76EE\u5F55 /\uFF1B\u6E05\u6D17\u533A = /ocr2md/" });
    el.createEl("p", { text: "\u672C\u9875\u4E0D\u8BFB\u53D6 Safari IndexedDB\uFF0C\u4E0D\u8FDE\u63A5 Mac \u6216 GD\uFF0C\u4E0D\u6267\u884C\u81EA\u52A8\u5220\u9664\u6216\u6279\u91CF\u5199\u5165\u3002" });
    const target = isTargetVault(vault.getName());
    if (!target) {
      el.createEl("p", { text: `\u672A\u8FDE\u63A5\u76EE\u6807\u5E93\uFF1A\u8BF7\u5148\u5728 Obsidian \u5207\u6362\u5230\u540D\u4E3A ${EXPECTED_VAULT} \u7684\u5E93\u3002` });
    }
    const folder = (_a = this.current) != null ? _a : root;
    const breadcrumb = el.createDiv();
    breadcrumb.setText(`\u5F53\u524D\u4F4D\u7F6E\uFF1A/${folder.path === "/" ? "" : folder.path}`);
    const top = el.createDiv();
    const rootButton = top.createEl("button", { text: "\u8FD4\u56DE Vault Root /" });
    rootButton.addEventListener("click", () => {
      this.current = root;
      void this.render();
    });
    const parentButton = top.createEl("button", { text: "\u8FD4\u56DE\u4E0A\u4E00\u7EA7" });
    parentButton.disabled = folder === root;
    parentButton.addEventListener("click", () => {
      this.current = folder.parent instanceof import_obsidian.TFolder ? folder.parent : root;
      void this.render();
    });
    const rows = el.createDiv();
    rows.createEl("h4", { text: "\u5E93\u4E2D\u771F\u5B9E\u76EE\u5F55\u4E0E\u6587\u4EF6\uFF08\u53EA\u8BFB\u5217\u4E3E\uFF09" });
    for (const child of [...folder.children].sort((a, b) => {
      if (a instanceof import_obsidian.TFolder !== b instanceof import_obsidian.TFolder) return a instanceof import_obsidian.TFolder ? -1 : 1;
      return a.name.localeCompare(b.name, "zh-CN");
    })) {
      if (isProtectedPath(child.path, vault.configDir)) continue;
      const row = rows.createDiv();
      if (child instanceof import_obsidian.TFolder) {
        const btn = row.createEl("button", { text: `\u{1F4C1} ${child.name}/` });
        btn.addEventListener("click", () => {
          this.current = child;
          void this.render();
        });
      } else if (child instanceof import_obsidian.TFile) {
        const btn = row.createEl("button", { text: `\u{1F4C4} ${child.name}` });
        btn.addEventListener("click", async () => {
          await this.app.workspace.getLeaf(true).openFile(child);
        });
      }
    }
    const workDir = vault.getFolderByPath(WORK_AREA);
    const probe = el.createDiv();
    probe.createEl("h4", { text: "\u771F\u5B9E\u6587\u4EF6\u5199\u5165/\u8BFB\u56DE\u9A8C\u6536" });
    if (!workDir) {
      probe.createEl("p", { text: "\u6CA1\u6709\u53D1\u73B0 /ocr2md/ \u6E05\u6D17\u5DE5\u4F5C\u76EE\u5F55\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u521B\u5EFA\u6216\u5199\u5165\uFF0C\u8BF7\u786E\u8BA4\u5B9E\u9645\u5E93\u7ED3\u6784\u3002" });
      return;
    }
    probe.createEl("p", { text: "\u70B9\u51FB\u9A8C\u6536\u5C06\u4EC5\u5728 /ocr2md/ \u4E0B\u521B\u5EFA\u552F\u4E00\u540D\u79F0\u7684 Markdown \u6D4B\u8BD5\u6587\u4EF6\uFF1B\u4E0D\u4F1A\u4FEE\u6539\u4EFB\u4F55\u5DF2\u6709\u6587\u4EF6\u3002" });
    const label = probe.createEl("label");
    this.consent = document.createElement("input");
    this.consent.type = "checkbox";
    label.appendChild(this.consent);
    label.appendText(" \u6211\u786E\u8BA4\u5728\u771F\u5B9E Obsidian \u5E93\u521B\u5EFA\u4E00\u4EFD\u65B0\u9A8C\u8BC1\u6587\u4EF6");
    const result = probe.createDiv();
    const writeButton = probe.createEl("button", { text: "\u5199\u5165\u5E76\u8BFB\u56DE\u771F\u5B9E\u6587\u4EF6" });
    writeButton.disabled = !target;
    writeButton.addEventListener("click", async () => {
      var _a2;
      if (!target || !((_a2 = this.consent) == null ? void 0 : _a2.checked)) {
        new import_obsidian.Notice("\u5148\u52FE\u9009\u771F\u5B9E\u6587\u4EF6\u5199\u5165\u786E\u8BA4");
        return;
      }
      writeButton.disabled = true;
      try {
        const path = testNotePath(Date.now());
        if (vault.getAbstractFileByPath(path)) throw new Error("\u9A8C\u8BC1\u6587\u4EF6\u5DF2\u7ECF\u5B58\u5728\uFF0C\u53D6\u6D88\u5199\u5165");
        const expected = `# ocr2md iPad Vault Root \u5199\u5165\u9A8C\u6536

\u6765\u6E90\uFF1AObsidian Mobile \u63D2\u4EF6
Vault: ${vault.getName()}
Path: ${path}
`;
        const file = await vault.create(path, expected);
        const reread = await vault.read(file);
        if (reread !== expected) throw new Error("\u771F\u5B9E\u6587\u4EF6\u8BFB\u56DE\u5185\u5BB9\u4E0D\u4E00\u81F4");
        result.setText(`\u771F\u5B9E\u5E93\u5199\u5165\u548C\u8BFB\u56DE\u6210\u529F\uFF1A${path}\u3002\u8BF7\u5728 Obsidian \u6587\u4EF6\u6811\u6216 Mac/iCloud \u68C0\u67E5\u6B64\u6587\u4EF6\u3002`);
        new import_obsidian.Notice("ocr2md \u771F\u5E93\u6587\u4EF6\u8BFB\u5199\u4E00\u81F4");
        this.current = workDir;
      } catch (err) {
        result.setText("\u9A8C\u6536\u5931\u8D25\uFF1A" + String(err));
      } finally {
        writeButton.disabled = false;
      }
    });
  }
};
var OCR2MDVaultProbePlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new VaultProbeView(leaf));
    this.addRibbonIcon("folder-search", "ocr2md v3 \u771F\u5E93 Root", () => {
      void this.activate();
    });
    this.addCommand({ id: "open-ocr2md-v3-real-vault-root", name: "\u6253\u5F00\u771F\u5B9E Obsidian Vault Root \u9A8C\u6536", callback: () => {
      void this.activate();
    } });
  }
  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
  async activate() {
    const workspace = this.app.workspace;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
};
