# OCR2MD V4 · 顶栏导航与统一按钮（v4.7.1）

## Feature Contract（操作 / 需要 / 效果）

- **目录导航**：用户在工作台右侧下拉选择路径。需要已经在工作目录设定书籍 root、CQE 授权只读 `chapters/` 列表。结果：下拉当前选项仅显示**目录名加 `/`** 或**章节 MD 文件名**，不掺入业务模块名、状态文案。`root`→章节定界，`chapters/` 或其文件→章节清洗；仍由各插件决定路径意义，而非 WCP 核心。
- **全局编辑操作**：顶栏右端始终只有三个固定按钮——「撤销」「重做」「保存标定」。它们是公共视觉控件，不是 WCP 通用数据写权限。每个业务插件在 manifest actions 内为实际命令声明 `globalRole: undo|redo|save`；底座只验证角色并把点击转交当前激活模块的**已有**命令，状态直接镜像该模块按钮 `disabled`，无适配、未加载、切换中时禁用。设置页保存仍是设置配置保存，章节定界页保存是 IR 原始 CAS 快照，章节清洗页保存是明确确认之后的已发布 MD CAS；绝不自动触发别的模块，文件鉴权和版本校验继续由文件服务控制。
- **模块按钮区**：固定在 Tab 导航的下一行。当前模块拥有的功能按钮、下拉、操作菜单必须进入此区并随模块显示；不应重复落在 AG/源码 pane 的顶端，也不放到全局三键中。设置的「恢复默认/发布」；章节定界的「发布章节/PDF 源切换/重试加载/标定章节/目录编辑」；清洗的「子模块选择/标题序号/下载图片/转换 OB」各自归位。PDF 翻页与缩放属于**预览窗局部控制**，继续留在预览窗顶部。AG 的“只看一级标题”等是**表格过滤控件**，继续位于 AG 标题行。
- **驻留/安全**：切换 Settings ↔ Workbench/Boundary ↔ Cleaning 过程中，已连接 AG 与 CodeMirror 保持驻留；公共按钮不拥有模型实例或业务处理、不能直接发 Vault 请求。打开、导航、撤销/重做无需文件写入，保存严格显式触发对应 CQE。操作未完成时禁用全局按钮；不可因按钮迁移丢失原焦点、DIRjson、MD 草稿、PDF 页码。

## UIC

| ID | 初始与用户动作 | UI 预期 | 数据副作用 | 自动化验收 |
|---|---|---|---|---|
| TOP-01 | 新版进入工作目录、尚未设置书籍 | 顶栏 3 键固定在右侧且全部禁用，模块按钮区仅显示当前模块标签 | 只读 | `workbenchV3Navigation.mjs` Chromium/WebKit |
| TOP-02 | 设根书籍后打开顶栏导航 | 选项显示 `Bufett’s Alpha/`、`chapters/`、`00 Buffett’s Alpha.md` 等纯路径/文件名；选中项可见 | 仅授权 list | `workbenchV3Navigation.mjs` Chromium/WebKit |
| TOP-03 | 根目录章节定界视图 | AG 仍持有筛选与状态；按钮区包含 PDF 来源、重试、章节标定、目录编辑、发布章节；右端只有三全局键，原命令节点在隐藏托管容器 | 无写入 | 同上 + `chapterBoundaryMigration.mjs` |
| TOP-04 | 根目录修改 DIRjson，点击全局撤销/重做/保存标定 | 与原定界 v3 同源操作，保存读回 SHA、无额外自动写入 | 显式原 IR 事务 | 隔离书籍 `workbenchV3SaveFixture.mjs` |
| TOP-05 | 导航到 `chapters/*.md` | 模块按钮区切换为标题序号/子模块选择/下载图片/转换 OB；预览窗自己的 PDF/MD/页码按钮不移动 | 只读导航 | `workbenchV3Navigation.mjs` |
| TOP-06 | 章节 MD 编辑后点击顶栏保存标定 | 全局点击仅转发清洗模块已有的确认和 `/__v3/chapters/commit`，SHA 与 CAS 读回；未确认不提交 | 显式 MD 事务 | 隔离书籍 `workbenchV3SaveFixture.mjs` |
| TOP-07 | 切换设置，点击全局撤销/重做/保存标定 | 改变当前设置草稿并保存配置；不触碰章节书籍 | 仅 UI 设置持久化 | `settingsTriPaneMigration.mjs` 两浏览器 |
| TOP-08 | iPad Safari 横/竖屏、触摸弹窗 | 三键始终可见，模块按钮区可横向滚动，详细编辑菜单不被截断 | 无自动写入 | `manual-external` 待用户审核 |

自动化禁止真实 Vault 写操作，涉及保存的测试须在隔离 Mac Vault fixture 中执行。实际 iPad 触控视觉等待用户审核。
