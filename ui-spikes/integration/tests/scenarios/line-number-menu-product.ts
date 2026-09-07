import type { UiInteractionContract } from "../uic/schema";

export const lineNumberMenuProduct: UiInteractionContract = {
  id: "UIC-EDIT-001",
  title: "正常清洗工作区点击行号加入当前数据表",
  area: "清洗工作区 / 源码行号 / 当前数据表",
  intent: "验证行号菜单是正常产品功能，不需要先进入功能调试或打开任何 debug-only 状态。",
  automation: "browser",
  fixture: {
    mode: "ui-test",
    source: "source.md",
    baseline: "source",
  },
  preconditions: [
    "直接进入固定清洗工作区，不点击功能调试。",
    "当前数据表切换为嵌入块。",
    "固定样例把第 18 行 Top Award 移到第 14 行；移动后的第 14 行不会被嵌入块扫描器自动收入。",
  ],
  steps: [
    {
      action: "selectModule",
      module: "嵌入块",
      note: "选择真实产品中的当前数据表。",
    },
    {
      action: "moveLines",
      startLine: 18,
      endLine: 18,
      beforeLine: 14,
      note: "只准备固定 fixture；不调用功能调试节点。",
    },
    {
      action: "clickSourceLine",
      line: 14,
      note: "正常点击源码第 14 行行号，真实产品菜单必须出现。",
    },
    {
      action: "clickControl",
      controlId: "source-line-add-current",
      note: "点击真实菜单中的“加入当前数据表”。若菜单没有出现，本步骤必须失败。",
    },
  ],
  expectations: [
    {
      kind: "workingEqualsMovedSource",
      startLine: 18,
      endLine: 18,
      beforeLine: 14,
      note: "人工加入不得再次修改 working。",
    },
    {
      kind: "sourceLineActive",
      line: 14,
    },
    {
      kind: "moduleNotice",
      module: "嵌入块",
      text: "+1",
      flashing: true,
    },
    {
      kind: "gridRow",
      module: "嵌入块",
      line: 14,
      text: "Top Award",
      lineType: "嵌入文本",
      navigable: true,
      note: "第 14 行必须通过真实产品行号菜单人工进入当前嵌入块表。",
    },
  ],
  invariants: [
    "本场景不得点击 ui-debug-toggle、ui-debug-line-menu 或任何功能调试控件。",
    "点击行号菜单必须是正常清洗工作区的产品能力。",
    "行号点击先移动光标并高亮对应行号，再打开菜单。",
    "菜单只操作当前数据表。",
    "人工加入必须复用 ChapterReviewApplication.addManualReviewLine()。",
    "人工加入不得修改 working。",
  ],
  evidence: {
    browserTest: "ui-spikes/integration/tests/ui.spec.ts",
    coreTest: "src/chapterReviewApplication.test.ts",
  },
  tags: ["product", "line-number", "manual-review", "embed", "no-debug-gate"],
};
