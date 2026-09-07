import type { UiInteractionContract } from "../uic/schema";

export const uiDebugLineMenuProduction: UiInteractionContract = {
  id: "UIC-DEBUG-005",
  title: "真实页面执行行号菜单完整样例",
  area: "真实页面 / 顶部功能调试 / 嵌入块",
  intent: "防止 ui-test 通过但 iPad 实际页面行为不同：真实 / 页面单击行号菜单节点后必须直接得到完整最终结果。",
  automation: "browser",
  fixture: {
    mode: "production-debug",
    source: "source.md",
    baseline: "source",
  },
  preconditions: [
    "加载真实 / 页面，不使用 ?ui-test=1。",
    "功能调试节点使用内置固定 fixture，不写真实 Google Drive。",
  ],
  steps: [
    { action: "clickControl", controlId: "ui-debug-toggle", note: "打开真实页面的功能调试下拉。" },
    {
      action: "clickControl",
      controlId: "ui-debug-line-menu",
      note: "只点击一次行号菜单节点；节点自身必须完成 18→14 和人工加入嵌入块。",
    },
    {
      action: "clickControl",
      controlId: "ui-debug-toggle",
      note: "重新打开调试下拉，核对禁用的是正确节点。",
    },
  ],
  expectations: [
    { kind: "workspaceVisible", workspace: "cleaning" },
    {
      kind: "sourceLineActive",
      line: 14,
      note: "真实页面执行完成后源码光标应停在第 14 行。",
    },
    {
      kind: "controlState",
      controlId: "ui-debug-line-menu",
      visible: true,
      disabled: true,
      text: "行号菜单",
      note: "执行后必须灰掉行号菜单自身。",
    },
    {
      kind: "controlState",
      controlId: "ui-debug-move-source-block",
      visible: true,
      disabled: false,
      text: "移动源文本块",
      note: "行号菜单样例不能错误灰掉移动源文本块。",
    },
    {
      kind: "controlState",
      controlId: "ui-debug-edit-text-line",
      visible: true,
      disabled: false,
      text: "修改文本行",
      note: "行号菜单样例不能错误灰掉修改文本行。",
    },
    {
      kind: "moduleNotice",
      module: "嵌入块",
      text: "+1",
      flashing: true,
      note: "真实页面必须给出嵌入块 +1 可见反馈。",
    },
    {
      kind: "gridRow",
      module: "嵌入块",
      line: 14,
      text: "Top Award",
      lineType: "嵌入文本",
      navigable: true,
      note: "真实页面的嵌入块表必须直接出现第 14 行 Top Award；不能依赖后续人工补操作。",
    },
  ],
  invariants: [
    "真实 / 页面与 ?ui-test=1 的功能调试结果必须一致。",
    "调试节点一次点击即产生最终结果，不允许测试再额外点击 14 行号或加入按钮补成功。",
    "执行行号菜单后只禁用行号菜单自身。",
    "第 14 行 Top Award 必须真实出现在当前嵌入块表。",
    "功能调试 fixture 不得写入真实 Google Drive。",
  ],
  evidence: {
    browserTest: "ui-spikes/integration/tests/ui.spec.ts",
  },
  tags: ["ui-debug", "production-route", "ipad", "embed", "smoke"],
};
