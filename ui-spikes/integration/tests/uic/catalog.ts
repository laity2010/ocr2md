import type { UiInteractionContract } from "./schema";
import { editLine378Submitted } from "../scenarios/edit-line-378-submitted";
import { gridLineTypeIgnoreOption } from "../scenarios/grid-line-type-ignore-option";
import { lineNumberMenuProduct } from "../scenarios/line-number-menu-product";
import { moveEditorNote376To378To359 } from "../scenarios/move-editor-note-376-378-to-359";
import { uiDebugEditTextLine } from "../scenarios/ui-debug-edit-text-line";
import { uiDebugIgnoreLineType } from "../scenarios/ui-debug-ignore-line-type";
import { uiDebugInitialize } from "../scenarios/ui-debug-initialize";
import { uiDebugLineContextMenu } from "../scenarios/ui-debug-line-context-menu";
import { uiDebugLineMenuProduction } from "../scenarios/ui-debug-line-menu-production";
import { uiDebugMoveSourceBlock } from "../scenarios/ui-debug-move-source-block";
import { uiDebugSaveReenter } from "../scenarios/ui-debug-save-reenter";
import { uiDebugUndoRedo } from "../scenarios/ui-debug-undo-redo";
import { workbenchRedoAnnotation } from "../scenarios/workbench-redo-annotation";
import { workbenchRedoBranchInvalidated } from "../scenarios/workbench-redo-branch-invalidated";
import { workbenchUndoAnnotation } from "../scenarios/workbench-undo-annotation";
import { workbenchUndoText } from "../scenarios/workbench-undo-text";
import { workbenchUndoRedoShortcut } from "../scenarios/workbench-undo-redo-shortcut";

export const executableUiContracts: UiInteractionContract[] = [
  moveEditorNote376To378To359,
  editLine378Submitted,
  gridLineTypeIgnoreOption,
  lineNumberMenuProduct,
  workbenchUndoAnnotation,
  workbenchRedoAnnotation,
  workbenchRedoBranchInvalidated,
  workbenchUndoText,
  workbenchUndoRedoShortcut,
  uiDebugMoveSourceBlock,
  uiDebugInitialize,
  uiDebugLineContextMenu,
  uiDebugLineMenuProduction,
  uiDebugEditTextLine,
  uiDebugIgnoreLineType,
  uiDebugUndoRedo,
  uiDebugSaveReenter,
];

export const uiContractCatalog = [
  {
    id: "UIC-NAV-001",
    title: "启动默认进入 GD 工作区",
    area: "顶部工作区导航 / GD",
    automation: "manual-external",
    summary: "启动后默认进入 GD；恢复或建立 Drive 会话；已有工作目录时预缓存目录结构。",
  },
  {
    id: "UIC-GD-001",
    title: "选择工作目录",
    area: "GD 工作区 / 工作目录",
    automation: "manual-external",
    summary: "当前目录设为工作目录后，顶栏显示该目录，并可从工作目录树继续选择章节。",
  },
  {
    id: "UIC-GD-002",
    title: "从工作目录树打开章节",
    area: "工作目录树 / 清洗工作区",
    automation: "manual-external",
    summary: "点击章节目录后加载原稿、working、sidecar，并切换到清洗工作区。",
  },
  {
    id: "UIC-CLEAN-001",
    title: "移动 Editor’s Note 后刷新标题与变动行",
    area: "清洗工作区 / 章节标题 / 变动行",
    automation: "browser",
    summary: "376–378 移到 359 后，章节标题和变动行必须完整列示。",
  },
  {
    id: "UIC-CLEAN-004",
    title: "正文单行修改进入变动行",
    area: "清洗工作区 / 变动行",
    automation: "browser",
    summary: "第 378 行 Submited → Submitted 后，变动行必须显示修改并归属未归类。",
  },
  {
    id: "UIC-CLEAN-002",
    title: "保存标定并在重入时自动加载",
    area: "清洗工作区 / 数据表顶栏 / Drive",
    automation: "manual-external",
    summary: "保存必须同时写 working 与 sidecar；再次进入同一章节时自动加载保存后的正文与人工标定，人工标定不得被重扫覆盖。",
  },
  {
    id: "UIC-CLEAN-003",
    title: "切换标定模块",
    area: "清洗工作区 / 数据表模块标签",
    automation: "browser",
    summary: "章节标题、注释、嵌入块、非法断行、变动行切换时只显示所属数据，不改变源码位置和内容。",
  },
  {
    id: "UIC-DEBUG-001",
    title: "功能调试下拉执行移动源文本块",
    area: "顶部工作区导航 / 功能调试",
    automation: "browser",
    summary: "点击移动源文本块后执行 376–378 → 359，并因前置条件变化立即禁用该节点。",
  },
  {
    id: "UIC-DEBUG-002",
    title: "功能调试初始化",
    area: "顶部工作区导航 / 功能调试",
    automation: "browser",
    summary: "初始化恢复 source 基线、章节标题模块和调试节点可执行状态。",
  },
  {
    id: "UIC-DEBUG-003",
    title: "移动 18→14 后加入当前嵌入块表",
    area: "顶部功能调试 / 源码行号 / 嵌入块",
    automation: "browser",
    summary: "先把工作稿第 18 行 Top Award 移到第 14 行，再点击 14 行号人工加入当前嵌入块表，并禁止重复加入。",
  },
  {
    id: "UIC-DEBUG-005",
    title: "真实页面执行行号菜单完整样例",
    area: "真实页面 / 顶部功能调试 / 嵌入块",
    automation: "browser",
    summary: "真实 / 页面只点击一次行号菜单节点，就必须得到第 14 行 Top Award 已进入嵌入块表的最终结果，并且只禁用行号菜单。",
  },
  {
    id: "UIC-DEBUG-006",
    title: "修正第 26 行 OCR 文本并反映到变动行",
    area: "真实页面 / 顶部功能调试 / 变动行 / 注释",
    automation: "browser",
    summary: "精确修正第 26 行指定 OCR 片段；变动行显示修改 / 未归类，同时保留未触碰的 <sup>1</sup> 注释引用。",
  },
  {
    id: "UIC-DEBUG-007",
    title: "功能调试：行类型设为已忽略",
    area: "功能调试 / 数据表 / 行类型",
    automation: "browser",
    summary: "固定注释候选设为已忽略后从当前表隐藏，但审核状态保留且 working 不变。",
  },
  {
    id: "UIC-DEBUG-008",
    title: "功能调试：撤销 / 重做完整流程",
    area: "真实页面 / 功能调试 / 撤销 / 重做",
    automation: "browser",
    summary: "功能调试只占一个入口；一次点击逐步跑完 6 个 Undo/Redo 核心场景，并在界面显示 6/6 结果。",
  },
  {
    id: "UIC-DEBUG-009",
    title: "功能调试：保存标定并重入自动加载",
    area: "真实页面 / 功能调试 / 保存标定 / 重入",
    automation: "browser",
    summary: "修改正文和人工标定后保存，离开章节并恢复未修改内存基线，再重入自动加载已保存 working 与 sidecar。",
  },
  {
    id: "UIC-GRID-001",
    title: "所有可编辑模块的行类型都包含已忽略",
    area: "清洗工作区 / 数据表 / 行类型",
    automation: "browser",
    summary: "章节标题、注释、嵌入块、非法断行的实际行类型下拉都必须固定包含已忽略。",
  },
  {
    id: "UIC-EDIT-001",
    title: "正常清洗工作区点击行号加入当前数据表",
    area: "清洗工作区 / 源码行号 / 当前数据表",
    automation: "browser",
    summary: "不经过功能调试，直接点击源码行号弹出真实菜单并把目标行加入当前数据表。",
  },
  {
    id: "UIC-EDIT-002",
    title: "正常产品撤销已忽略标定",
    area: "清洗工作区 / 撤销 / 数据表",
    automation: "browser",
    summary: "注释设为已忽略后，真实撤销按钮恢复注释引用且 Redo 可用。",
  },
  {
    id: "UIC-EDIT-003",
    title: "正常产品重做已忽略标定",
    area: "清洗工作区 / 重做 / 数据表",
    automation: "browser",
    summary: "Undo 后真实重做按钮再次恢复已忽略状态。",
  },
  {
    id: "UIC-EDIT-004",
    title: "Undo 后新操作清空旧 Redo",
    area: "清洗工作区 / Undo / Redo 分支",
    automation: "browser",
    summary: "Undo 后执行新文本修改，旧 Redo 分支必须立即失效。",
  },
  {
    id: "UIC-EDIT-005",
    title: "正常产品撤销文本修改",
    area: "清洗工作区 / 撤销 / 源码",
    automation: "browser",
    summary: "文本 Undo 恢复 working、变动行和原标定状态。",
  },
  {
    id: "UIC-EDIT-006",
    title: "Undo / Redo 快捷键等价于正式按钮",
    area: "清洗工作区 / 撤销 / 重做 / 快捷键",
    automation: "browser",
    summary: "Ctrl/Command+Z 与 Ctrl/Command+Shift+Z 复用工作台级 Undo/Redo，而不是 CodeMirror 私有历史。",
  },
  {
    id: "UIC-CSS-001",
    title: "自定义 CSS 保存与恢复",
    area: "源码窗 / 自定义 CSS",
    automation: "browser",
    summary: "仅允许白名单字体变量；实时预览；保存到 localStorage；恢复默认后清除自定义值。",
  },
] as const;
