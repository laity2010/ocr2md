# ocr2md Feature Contract Catalog

功能调试与人工验收的首要索引。

| 功能 ID | 功能 | 操作 | 需要 | 效果 | 功能调试 | 自动验证 | 人工审核 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FC-EDIT-001 | 行号菜单 | 点击源码行号，将该行加入当前数据表 | 清洗工作区；章节模式；当前模块支持人工加入 | 弹出当前数据表菜单；加入后表格出现该行；重复加入禁用 | 已接入 | UIC-EDIT-001, UIC-DEBUG-003, UIC-DEBUG-005 | 待用户审核 |
| FC-EDIT-002 | 修改文本行 | 精确修改工作稿文本 | 固定 OCR 文本存在 | working 修改；变动行反映实际修改；未修改模块候选保留 | 已接入 | UIC-DEBUG-006 | 待用户审核 |
| FC-EDIT-003 | 移动源文本块 | 移动工作稿连续行块 | 清洗工作区；固定 source 基线 | working 移动；章节标题/变动行同步刷新 | 已接入 | UIC-CLEAN-001, UIC-DEBUG-001 | 待用户审核 |
| FC-EDIT-005 | 撤销 / 重做 | 点击撤销/重做，或使用 ⌘/Ctrl+Z、⌘/Ctrl+Shift+Z | 当前章节会话内存在历史操作 | 统一恢复 working + reviewRows + annotationPairs；Undo 后新操作清空旧 Redo；打开新章节清空历史 | 已接入（功能调试仅一个入口，内部 6 步） | UIC-EDIT-002~006, UIC-DEBUG-008, workbenchHistory.test.ts | 待用户审核 |
| FC-GRID-001 | 行类型：已忽略 | 在任意可编辑数据表把候选行设为“已忽略” | 当前模块存在可编辑候选行 | 所有可编辑模块下拉固定含“已忽略”；选择后当前表隐藏该行，审核状态保留，working 不变 | 已接入 | UIC-GRID-001, UIC-DEBUG-007, reviewModuleDefinitions.test.ts | 待用户审核 |
| FC-CLEAN-001 | 切换数据表模块 | 点击章节标题/注释/嵌入块/非法断行/变动行 | 已打开清洗工作区 | 只显示当前模块数据，不修改 working | 待接入 | UIC-CLEAN-003 待自动化 | 待用户审核 |
| FC-CLEAN-002 | 保存标定 / 重入自动加载 | 点击保存标定；离开后再次进入同一章节 | 已打开章节工作稿；真实产品需 Drive 可写 | 同时保存 working 与 sidecar；重入自动恢复保存后的正文和人工标定；人工标定不得被重扫覆盖；新会话清空 Undo/Redo | 已接入（功能调试一个入口，内存模拟持久化，不写真实 Drive） | UIC-CLEAN-002 manual-external, UIC-DEBUG-009, chapterWorkspaceApplication.test.ts | 待用户审核 |
| FC-EDIT-004 | 正则搜索 | 输入正则并前后导航匹配 | 源码窗打开 | 命中定位/计数更新，不修改 working | 待接入 | 待补 UIC | 待用户审核 |
| FC-CSS-001 | 自定义 CSS | 编辑、保存、恢复默认 | CSS 编辑器打开 | 白名单变量实时预览并持久化/恢复 | 待接入 | UIC-CSS-001 待自动化 | 待用户审核 |
| FC-GD-001 | 连接/断开 Google Drive | 连接或断开 Drive 会话 | OAuth 可用 | 会话状态与 GD UI 同步 | 待接入 | manual-external | 待用户审核 |
| FC-GD-002 | 选择工作目录 | 将当前 Drive 目录设为工作目录 | Drive 已连接 | 顶栏显示工作目录并可浏览目录树 | 待接入 | UIC-GD-001 manual-external | 待用户审核 |
| FC-GD-003 | 打开章节 | 从工作目录树选择章节 | 已选工作目录；章节存在 | 加载 source/working/sidecar 并进入清洗工作区 | 待接入 | UIC-GD-002 manual-external | 待用户审核 |
| FC-NAV-001 | 工作区切换 | 切换 GD / 清洗工作区 | 页面已加载 | 对应工作区显示，另一工作区隐藏 | 待接入 | UIC-NAV-001 / 待补 browser | 待用户审核 |

## 规则

- “待接入”表示这是历史功能债务，不代表功能不存在。
- 新功能不得新增为“待接入”；新增时必须同时提供功能调试入口。
- 用户在真实页面审核后，将“人工审核”更新为“已通过”或“退回 + 原因”。
- 功能调试样例必须调用真实产品路径；若正常产品路径不可用，即使调试样例通过也视为失败。
