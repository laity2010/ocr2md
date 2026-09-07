import type { UiInteractionContract } from "../uic/schema";

export const uiDebugMoveSourceBlock: UiInteractionContract = {
  id: "UIC-DEBUG-001",
  title: "功能调试下拉执行移动源文本块",
  area: "顶部工作区导航 / 功能调试",
  intent: "验证 Agent/用户可以从顶栏直接执行标准移动文本块样例，并在前置条件改变后禁止重复执行。",
  automation: "browser",
  fixture: {
    mode: "ui-test",
    source: "source.md",
    baseline: "source",
  },
  preconditions: [
    "工作稿等于 source.md。",
    "移动源文本块节点可用。",
  ],
  steps: [
    { action: "clickControl", controlId: "ui-debug-toggle", note: "打开功能调试下拉。" },
    { action: "clickControl", controlId: "ui-debug-move-source-block", note: "执行 376–378 → 359。" },
    { action: "clickControl", controlId: "ui-debug-toggle", note: "重新打开调试下拉，验证节点状态。" },
  ],
  expectations: [
    { kind: "controlState", controlId: "ui-debug-menu", visible: true },
    {
      kind: "controlState",
      controlId: "ui-debug-move-source-block",
      visible: true,
      disabled: true,
      text: "移动源文本块",
      note: "执行后前置条件已变化，因此节点必须立即禁用。",
    },
    {
      kind: "controlState",
      controlId: "ui-debug-line-menu",
      visible: true,
      disabled: false,
      text: "行号菜单",
      note: "执行移动源文本块不得错误禁用另一个独立调试节点。",
    },
    {
      kind: "moduleNotice",
      module: "变动行",
      text: "+4",
      flashing: true,
      note: "标准样例执行后必须给出变动行 +4 的可见提示。",
    },
    {
      kind: "gridRow",
      module: "章节标题",
      line: 359,
      text: "## Editor’s Note",
      changed: true,
    },
  ],
  invariants: [
    "同一初始条件下的调试操作只能执行一次。",
    "调试节点必须走真实 CodeMirror / 扫描 / AG Grid 链路，而不是伪造结果。",
    "执行移动样例后仍保留初始化入口。",
  ],
  evidence: {
    browserTest: "ui-spikes/integration/tests/ui.spec.ts",
  },
  tags: ["ui-debug", "topbar", "move-lines", "one-shot"],
};
