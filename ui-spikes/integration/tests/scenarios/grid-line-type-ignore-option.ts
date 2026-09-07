import type { UiInteractionContract } from "../uic/schema";

export const gridLineTypeIgnoreOption: UiInteractionContract = {
  id: "UIC-GRID-001",
  title: "所有可编辑模块的行类型都包含已忽略",
  area: "清洗工作区 / 数据表 / 行类型",
  intent: "把“已忽略”固定为数据表统一基础选项，不再依赖某个模块当前是否已经存在已忽略记录。",
  automation: "browser",
  fixture: {
    mode: "ui-test",
    source: "source.md",
    baseline: "source",
  },
  preconditions: [
    "直接进入固定清洗工作区。",
    "章节标题、注释、嵌入块、非法断行都有可编辑候选行。",
  ],
  steps: [
    {
      action: "setRowLineType",
      module: "注释",
      line: 26,
      value: "已忽略",
      note: "通过正常数据表行类型下拉，把第 26 行注释引用设为已忽略。",
    },
  ],
  expectations: [
    {
      kind: "lineTypeOptionAvailable",
      module: "章节标题",
      value: "已忽略",
      note: "章节标题行类型必须固定包含已忽略。",
    },
    {
      kind: "lineTypeOptionAvailable",
      module: "注释",
      value: "已忽略",
      note: "注释行类型必须使用统一值已忽略，不能再使用旧值忽略。",
    },
    {
      kind: "lineTypeOptionAvailable",
      module: "嵌入块",
      value: "已忽略",
      note: "嵌入块行类型必须固定包含已忽略。",
    },
    {
      kind: "lineTypeOptionAvailable",
      module: "非法断行",
      value: "已忽略",
      note: "非法断行行类型必须固定包含已忽略。",
    },
    {
      kind: "workingEqualsSource",
      note: "正常产品下拉把行设为已忽略不得修改 working。",
    },
    {
      kind: "gridLineAbsent",
      module: "注释",
      line: 26,
      note: "选择已忽略后，第 26 行必须从注释表隐藏。",
    },
    {
      kind: "reviewRowState",
      module: "注释",
      line: 26,
      text: "<sup>1</sup>",
      lineType: "已忽略",
      note: "隐藏后的注释审核状态仍必须保留为已忽略。",
    },
  ],
  invariants: [
    "已忽略是所有可编辑人工审核模块共享的固定行类型。",
    "选项存在不得依赖当前模块是否已经有已忽略记录。",
    "旧值“忽略”不得作为注释模块的正式行类型继续存在。",
    "已忽略表示保留审核状态但从当前数据表隐藏，不等于删除。",
    "选择已忽略不得修改 working 正文。",
  ],
  evidence: {
    browserTest: "ui-spikes/integration/tests/ui.spec.ts",
    coreTest: "src/reviewModuleDefinitions.test.ts",
  },
  tags: ["grid", "line-type", "ignored", "shared-behavior"],
};
