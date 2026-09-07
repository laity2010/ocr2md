import type { UiInteractionContract } from "../uic/schema";

export const workbenchUndoAnnotation: UiInteractionContract = {
  id: "UIC-EDIT-002",
  title: "正常产品撤销已忽略标定",
  area: "清洗工作区 / 撤销 / 数据表",
  intent: "验证正常产品路径中，数据表标定可被工作台级 Undo 恢复，而不是只支持源码文本撤销。",
  automation: "browser",
  fixture: { mode: "ui-test", source: "source.md", baseline: "source" },
  preconditions: [
    "直接进入清洗工作区，不使用功能调试。",
    "Undo / Redo 历史为空。",
    "第 26 行 <sup>1</sup> 为注释引用。",
  ],
  steps: [
    { action: "setRowLineType", module: "注释", line: 26, value: "已忽略" },
    { action: "clickControl", controlId: "undo-workbench", note: "点击真实撤销按钮。" },
  ],
  expectations: [
    { kind: "workingEqualsSource", note: "标定 Undo 不得修改 working。" },
    { kind: "gridRow", module: "注释", line: 26, text: "<sup>1</sup>", lineType: "注释引用" },
    { kind: "controlState", controlId: "undo-workbench", visible: true, disabled: true, text: "撤销" },
    { kind: "controlState", controlId: "redo-workbench", visible: true, disabled: false, text: "重做" },
  ],
  invariants: [
    "Undo 必须恢复 working + reviewRows + annotationPairs 的上一完整状态。",
    "数据表标定撤销不得依赖功能调试。",
    "Undo 后被撤销的状态进入 Redo。",
  ],
  evidence: {
    coreTest: "src/workbenchHistory.test.ts",
    browserTest: "ui-spikes/integration/tests/ui.spec.ts",
  },
  tags: ["undo", "annotation", "product", "history"],
};
