# ocr2md UI Interaction Contract Catalog

这是 Agent 查询现有界面互动语义的首要索引。

| UIC | 区域 | 互动 | 自动化 | 当前状态 |
| --- | --- | --- | --- | --- |
| UIC-NAV-001 | 顶部工作区导航 / GD | 启动默认进入 GD、恢复会话、缓存目录 | manual-external | 已定义，待外部 mock |
| UIC-GD-001 | GD / 工作目录 | 设当前目录为工作目录 | manual-external | 已定义，待外部 mock |
| UIC-GD-002 | 工作目录树 | 点击章节 → 加载原稿/working/sidecar → 清洗工作区 | manual-external | 已定义，待外部 mock |
| UIC-CLEAN-001 | 章节标题 / 变动行 | 376–378 移到 359 | browser | **已自动化** |
| UIC-CLEAN-004 | 变动行 | 378 行 Submited → Submitted | browser | **已自动化** |
| UIC-CLEAN-002 | 数据表顶栏 / Drive | 保存 working + sidecar；再次进入同章节自动加载已保存标定 | manual-external | 真实 Drive 人工验收；自动部分由 UIC-DEBUG-009 + core 覆盖 |
| UIC-CLEAN-003 | 数据表模块 | 切换章节标题/注释/嵌入块/非法断行/变动行 | browser | 待补自动样例 |
| UIC-DEBUG-001 | 顶部导航 / 功能调试 | 执行移动源文本块，一次性禁用 | browser | **已自动化** |
| UIC-DEBUG-002 | 顶部导航 / 功能调试 | 初始化恢复工作稿与界面 | browser | **已自动化** |
| UIC-DEBUG-003 | 功能调试 / 源码行号 / 当前数据表 | 工作稿 18→14；功能样例直接加入第 14 行到嵌入块表 | browser | **已自动化** |
| UIC-DEBUG-005 | 真实页面 / 功能调试 | 在真实 / 页面执行行号菜单并核对最终结果与正确禁用节点 | browser | **已自动化** |
| UIC-DEBUG-006 | 真实页面 / 功能调试 | 精确修正第 26 行 OCR 片段；变动行显示修改/未归类，<sup>1</sup> 注释保留 | browser | **已自动化** |
| UIC-DEBUG-007 | 功能调试 / 行类型 | 固定注释候选设为“已忽略”，当前表隐藏但审核状态保留 | browser | **已自动化** |
| UIC-DEBUG-008 | 真实页面 / 功能调试 / 撤销重做 | 单一入口一次运行 6 步 Undo/Redo，显示 6/6 后自动收起步骤面板 | browser | **已自动化** |
| UIC-DEBUG-009 | 真实页面 / 功能调试 / 保存重入 | 修改正文 + 已忽略 → 保存 → 离开 → 重入；5/5 后自动收起步骤面板 | browser | **已自动化** |
| UIC-GRID-001 | 数据表 / 行类型 | 所有可编辑模块的行类型固定包含“已忽略” | browser | **已自动化** |
| UIC-EDIT-001 | 正常清洗工作区 / 源码行号 | 不经过功能调试，点击行号 → 加入当前数据表 | browser | **已自动化** |
| UIC-EDIT-002 | 正常清洗工作区 / 撤销 | 已忽略标定 → Undo → 注释引用恢复 | browser | **已自动化** |
| UIC-EDIT-003 | 正常清洗工作区 / 重做 | 已忽略 → Undo → Redo → 再次已忽略 | browser | **已自动化** |
| UIC-EDIT-004 | 正常清洗工作区 / 历史分支 | Undo 后新操作必须清空旧 Redo | browser | **已自动化** |
| UIC-EDIT-005 | 正常清洗工作区 / 撤销 | 文本修改 → Undo → working/变动行/标定恢复 | browser | **已自动化** |
| UIC-EDIT-006 | 正常清洗工作区 / 快捷键 | Ctrl/Command+Z 与 Ctrl/Command+Shift+Z 复用统一历史 | browser | **已自动化** |
| UIC-CSS-001 | 源码窗 / 自定义 CSS | 编辑、实时预览、保存、恢复默认 | browser | 待补自动样例 |

## Agent 使用方法

开始处理某个 UI 问题前：

1. 先在本表找对应 UIC；
2. 阅读已有 scenario；
3. 若行为变化，更新 UIC，而不是只改代码；
4. 若没有 UIC，先创建一个；
5. 用户报告的复现步骤优先原样固化为新样例。

## 编号约定

```text
UIC-NAV-xxx    顶部导航 / 工作区切换
UIC-GD-xxx     Google Drive / 工作目录
UIC-CLEAN-xxx  清洗工作区
UIC-GRID-xxx   通用数据表行为
UIC-EDIT-xxx   源码编辑器
UIC-CSS-xxx    自定义样式
UIC-DEBUG-xxx  顶部功能调试入口 / 标准样例执行（保留历史编号）
UIC-LAYOUT-xxx 窗格 / splitter / iPad 布局
```

编号一旦进入样例库，不因文件改名而改变。
