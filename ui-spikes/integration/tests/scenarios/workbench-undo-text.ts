import type { UiInteractionContract } from "../uic/schema";

export const workbenchUndoText: UiInteractionContract = {
  id: "UIC-EDIT-005",
  title: "正常产品撤销文本修改",
  area: "清洗工作区 / 撤销 / 源码",
  intent: "验证工作台级 Undo 能恢复 working 文本，并同步恢复变动行和原有标定状态。",
  automation: "browser",
  fixture: { mode: "ui-test", source: "source.md", baseline: "source" },
  preconditions: ["历史为空；第 26 行存在固定 OCR 片段。"],
  steps: [
    {
      action: "replaceInLine",
      line: 26,
      search: "M<sup>uch</sup> <sup>has</sup> <sup>been</sup> <sup>said</sup> <sup>and</sup> <sup>writen</sup> <sup>about</sup> <sup>Warren</sup> <sup>Bufet</sup> <sup>and</sup> <sup>his</sup>",
      replace: "Much has been said and written about Warren Buffett and his ",
    },
    { action: "clickControl", controlId: "undo-workbench" },
  ],
  expectations: [
    { kind: "workingEqualsSource", note: "文本 Undo 必须完整恢复 source 基线。" },
    { kind: "gridLineAbsent", module: "变动行", line: 26, note: "文本恢复后第 26 行修改审计必须消失。" },
    { kind: "gridRow", module: "注释", line: 26, text: "<sup>1</sup>", lineType: "注释引用" },
    { kind: "controlState", controlId: "undo-workbench", visible: true, disabled: true, text: "撤销" },
    { kind: "controlState", controlId: "redo-workbench", visible: true, disabled: false, text: "重做" },
  ],
  invariants: [
    "文本 Undo 必须同步恢复 working、reviewRows、annotationPairs 和派生变动行。",
    "Undo 不得破坏未被该文本修改触碰的注释标定。",
  ],
  evidence: {
    coreTest: "src/workbenchHistory.test.ts",
    browserTest: "ui-spikes/integration/tests/ui.spec.ts",
  },
  tags: ["undo", "text-edit", "changed-lines", "history"],
};
