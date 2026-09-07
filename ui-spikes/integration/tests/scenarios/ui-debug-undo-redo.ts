import type { UiInteractionContract } from "../uic/schema";

export const uiDebugUndoRedo: UiInteractionContract = {
  id: "UIC-DEBUG-008",
  title: "功能调试：撤销 / 重做完整流程",
  area: "真实页面 / 功能调试 / 撤销 / 重做",
  intent: "用唯一一个功能调试入口，在真实页面逐步演示并自检 Undo/Redo 的完整核心流程。",
  automation: "browser",
  fixture: { mode: "production-debug", source: "source.md", baseline: "source" },
  preconditions: [
    "直接加载真实 / 页面。",
    "功能调试内部恢复固定 fixture 并清空历史，不写真实 Google Drive。",
  ],
  steps: [
    { action: "clickControl", controlId: "ui-debug-toggle", note: "打开功能调试。" },
    { action: "clickControl", controlId: "ui-debug-undo-redo", note: "一次点击启动完整 6 步流程；测试不得补做业务操作。" },
    { action: "clickControl", controlId: "ui-debug-toggle", note: "仅用于最终检查功能调试节点状态。" },
  ],
  expectations: [
    { kind: "featureDebugProgress", state: "passed", visible: false, completedSteps: 6, title: "6/6 通过", note: "通过结果短暂显示后必须自动收起，不能遮挡后续操作。" },
    { kind: "workspaceVisible", workspace: "cleaning" },
    { kind: "moduleActive", module: "注释" },
    { kind: "gridRow", module: "注释", line: 26, text: "<sup>1</sup>", lineType: "注释引用" },
    { kind: "controlState", controlId: "undo-workbench", visible: true, disabled: true, text: "撤销" },
    { kind: "controlState", controlId: "redo-workbench", visible: true, disabled: false, text: "重做" },
    { kind: "controlState", controlId: "ui-debug-undo-redo", visible: true, disabled: true, text: "撤销 / 重做" },
    { kind: "controlState", controlId: "ui-debug-line-menu", visible: true, disabled: false, text: "行号菜单" },
  ],
  invariants: [
    "功能调试菜单只提供一个撤销 / 重做入口，不按步骤拆成多个菜单项。",
    "一次点击必须自行跑完 6 个步骤，runner 不得补做 Undo/Redo 或文本/标定业务动作。",
    "6 步必须使用正常产品的 applyReviewRowLineType、performWorkbenchUndo、performWorkbenchRedo 和文本编辑路径。",
    "最终恢复基线；旧 Redo 分支已被新操作验证清空；最终 Redo 仅代表最后一次文本 Undo。",
    "成功完成后步骤进度面板必须自动收起；失败时应保留面板用于诊断。",
  ],
  evidence: {
    coreTest: "src/workbenchHistory.test.ts",
    browserTest: "ui-spikes/integration/tests/ui.spec.ts",
  },
  tags: ["feature-debug", "undo", "redo", "production-route", "history"],
};
