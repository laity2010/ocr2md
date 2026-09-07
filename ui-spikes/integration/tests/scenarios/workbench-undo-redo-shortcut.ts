import type { UiInteractionContract } from "../uic/schema";

export const workbenchUndoRedoShortcut: UiInteractionContract = {
  id: "UIC-EDIT-006",
  title: "Undo / Redo 快捷键等价于正式按钮",
  area: "清洗工作区 / 撤销 / 重做 / 快捷键",
  intent: "验证 Ctrl/Command+Z 与 Ctrl/Command+Shift+Z 使用同一工作台历史，而不是 CodeMirror 私有文本历史。",
  automation: "browser",
  fixture: { mode: "ui-test", source: "source.md", baseline: "source" },
  preconditions: ["历史为空；第 26 行为注释引用。"],
  steps: [
    { action: "setRowLineType", module: "注释", line: 26, value: "已忽略" },
    { action: "pressShortcut", keys: "Control+z", note: "自动环境验证 Ctrl+Z；Mac 的 Meta+Z 使用同一事件分支。" },
    { action: "pressShortcut", keys: "Control+Shift+z", note: "重做快捷键。" },
  ],
  expectations: [
    { kind: "workingEqualsSource" },
    { kind: "gridLineAbsent", module: "注释", line: 26 },
    { kind: "reviewRowState", module: "注释", line: 26, text: "<sup>1</sup>", lineType: "已忽略" },
    { kind: "controlState", controlId: "undo-workbench", visible: true, disabled: false, text: "撤销" },
    { kind: "controlState", controlId: "redo-workbench", visible: true, disabled: true, text: "重做" },
  ],
  invariants: [
    "快捷键必须调用同一 performWorkbenchUndo / performWorkbenchRedo 产品路径。",
    "源码编辑器不得再维护一套与工作台历史冲突的私有 Undo 栈。",
    "普通文本 input/textarea 仍保留其本地编辑撤销。",
  ],
  evidence: {
    coreTest: "src/workbenchHistory.test.ts",
    browserTest: "ui-spikes/integration/tests/ui.spec.ts",
  },
  tags: ["undo", "redo", "keyboard", "history"],
};
