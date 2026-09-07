import type { UiInteractionContract } from "../uic/schema";

export const workbenchRedoBranchInvalidated: UiInteractionContract = {
  id: "UIC-EDIT-004",
  title: "Undo 后新操作清空旧 Redo",
  area: "清洗工作区 / Undo / Redo 分支",
  intent: "验证从历史状态分叉后旧 Redo 立即失效，避免重放已经不属于当前历史链的操作。",
  automation: "browser",
  fixture: { mode: "ui-test", source: "source.md", baseline: "source" },
  preconditions: ["历史为空；第 26 行注释引用与 OCR 原文均存在。"],
  steps: [
    { action: "setRowLineType", module: "注释", line: 26, value: "已忽略" },
    { action: "clickControl", controlId: "undo-workbench" },
    {
      action: "replaceInLine",
      line: 26,
      search: "M<sup>uch</sup> <sup>has</sup> <sup>been</sup> <sup>said</sup> <sup>and</sup> <sup>writen</sup> <sup>about</sup> <sup>Warren</sup> <sup>Bufet</sup> <sup>and</sup> <sup>his</sup>",
      replace: "Much has been said and written about Warren Buffett and his ",
      note: "Undo 后执行一项新的真实文本修改。",
    },
  ],
  expectations: [
    { kind: "controlState", controlId: "redo-workbench", visible: true, disabled: true, text: "重做", note: "新操作必须清空旧 Redo。" },
    { kind: "controlState", controlId: "undo-workbench", visible: true, disabled: false, text: "撤销" },
    {
      kind: "gridRow",
      module: "变动行",
      line: 26,
      text: "Much has been said and written about Warren Buffett and his investment style",
      change: "修改",
      owner: "未归类",
    },
    { kind: "reviewRowState", module: "注释", line: 26, text: "<sup>1</sup>", lineType: "注释引用" },
  ],
  invariants: [
    "Undo 后任何新的用户操作都必须立即清空旧 Redo 分支。",
    "新文本修改不得把未触碰的 <sup>1</sup> 注释引用重新归类。",
  ],
  evidence: {
    coreTest: "src/workbenchHistory.test.ts",
    browserTest: "ui-spikes/integration/tests/ui.spec.ts",
  },
  tags: ["undo", "redo", "branch", "text-edit", "history"],
};
