import type { UiInteractionContract } from "../uic/schema";

export const uiDebugIgnoreLineType: UiInteractionContract = {
  id: "UIC-DEBUG-007",
  title: "功能调试：行类型设为已忽略",
  area: "功能调试 / 数据表 / 行类型",
  intent: "用固定注释候选验证统一“已忽略”行为：从当前表隐藏，但审核状态保留且 working 不变。",
  automation: "browser",
  fixture: {
    mode: "ui-test",
    source: "source.md",
    baseline: "source",
  },
  preconditions: [
    "功能调试使用固定 source 基线。",
    "第 26 行存在 <sup>1</sup> 注释引用。",
  ],
  steps: [
    { action: "clickControl", controlId: "ui-debug-toggle", note: "打开功能调试。" },
    {
      action: "clickControl",
      controlId: "ui-debug-ignore-line-type",
      note: "固定样例将第 26 行 <sup>1</sup> 注释引用设为已忽略。",
    },
    { action: "clickControl", controlId: "ui-debug-toggle", note: "重新打开功能调试检查 completion 状态。" },
  ],
  expectations: [
    { kind: "workspaceVisible", workspace: "cleaning" },
    { kind: "moduleActive", module: "注释" },
    {
      kind: "workingEqualsSource",
      note: "将行类型改为已忽略不得修改 working。",
    },
    {
      kind: "gridLineAbsent",
      module: "注释",
      line: 26,
      note: "已忽略行必须从当前注释数据表隐藏。",
    },
    {
      kind: "reviewRowState",
      module: "注释",
      line: 26,
      text: "<sup>1</sup>",
      lineType: "已忽略",
      note: "隐藏不等于删除；审核状态必须仍保存为已忽略。",
    },
    {
      kind: "controlState",
      controlId: "ui-debug-ignore-line-type",
      visible: true,
      disabled: true,
      text: "行类型：已忽略",
      note: "功能样例执行后只禁用自己。",
    },
    {
      kind: "controlState",
      controlId: "ui-debug-line-menu",
      visible: true,
      disabled: false,
      text: "行号菜单",
    },
    {
      kind: "controlState",
      controlId: "ui-debug-edit-text-line",
      visible: true,
      disabled: false,
      text: "修改文本行",
    },
  ],
  invariants: [
    "功能调试必须复用真实 applyReviewRowLineType 产品路径。",
    "已忽略行从当前表隐藏，但仍保留在 reviewRows / sidecar 状态中。",
    "已忽略不等于已删除。",
    "已忽略不得修改 working。",
    "执行本样例不得禁用其他独立功能调试项目。",
  ],
  evidence: {
    browserTest: "ui-spikes/integration/tests/ui.spec.ts",
    coreTest: "src/reviewModuleDefinitions.test.ts",
  },
  tags: ["feature-debug", "grid", "line-type", "ignored"],
};
