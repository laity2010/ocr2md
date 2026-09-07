import type { UiInteractionContract } from "../uic/schema";

export const workbenchRedoAnnotation: UiInteractionContract = {
  id: "UIC-EDIT-003",
  title: "正常产品重做已忽略标定",
  area: "清洗工作区 / 重做 / 数据表",
  intent: "验证 Undo 后可用真实 Redo 恢复刚被撤销的标定状态。",
  automation: "browser",
  fixture: { mode: "ui-test", source: "source.md", baseline: "source" },
  preconditions: ["直接进入清洗工作区；历史为空；第 26 行为注释引用。"],
  steps: [
    { action: "setRowLineType", module: "注释", line: 26, value: "已忽略" },
    { action: "clickControl", controlId: "undo-workbench" },
    { action: "clickControl", controlId: "redo-workbench" },
  ],
  expectations: [
    { kind: "workingEqualsSource" },
    { kind: "gridLineAbsent", module: "注释", line: 26 },
    { kind: "reviewRowState", module: "注释", line: 26, text: "<sup>1</sup>", lineType: "已忽略" },
    { kind: "controlState", controlId: "undo-workbench", visible: true, disabled: false, text: "撤销" },
    { kind: "controlState", controlId: "redo-workbench", visible: true, disabled: true, text: "重做" },
  ],
  invariants: [
    "Redo 必须恢复刚被 Undo 的完整工作台状态。",
    "Redo 用完后按钮禁用，Undo 再次可用。",
  ],
  evidence: {
    coreTest: "src/workbenchHistory.test.ts",
    browserTest: "ui-spikes/integration/tests/ui.spec.ts",
  },
  tags: ["redo", "annotation", "product", "history"],
};
