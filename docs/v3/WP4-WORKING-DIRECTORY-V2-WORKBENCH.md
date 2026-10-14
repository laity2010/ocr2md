> **2026-10-08 新阶段：** 工作台已经增加“PDF”预览标签并从真实 Mac Vault 按范围读取原文；OCR JSON 当前仅统计，详见 `WP5-PDF-ORIGINAL-WORKBENCH.md`。

# WP4 — v3 选择工作目录 → v2 组件工作台（2026-10-08）

## 业务方向

`工作目录` 只负责浏览真实 Mac Obsidian Vault Root，单击文件夹后按 **「设为工作目录」**，自动进入新 `工作台` 标签。没有选中目录项时，可直接将当前浏览目录设为工作目录；文件行选中不会将文件本身误当目录。`设置` 仍复用 v2 的通用配置组件。文件均来自 Mac `/__v3/fs`，绝不使用 IndexedDB fixture，也不复制至其他库。

## 第一阶段已接入并运行的 v2 真组件

- `v2/src/calibrationGrid.ts` → `CalibrationGrid`：直接实例化真实 v2 AG Grid，启动时显示 **文本块** 校对模块行，点击行可定位源码。
- `v2/src/workingEditor.ts` → `WorkingEditor`：真实 v2 CodeMirror Markdown 源码窗，当前不可编辑。
- `v2/src/basicMarkdownPreview.ts` → `BasicMarkdownPreview`：真实 v2 Markdown 渲染管线（markdown-it、Obsidian 语法调整、DOMPurify、KaTeX），无自制或模拟预览器。
- `src/textBlocks.ts` → `scanTextBlocks`：使用与 v2 一样的真实文本块扫描与行哈希。v3 浏览器构建中对 Node crypto SHA-256 实现使用 `@noble/hashes` 精确同步替代，不改变原有 v2 模块。
- `src/workspaceFsV3.ts` + `MacVaultHttpRegistry`：对选定目录执行 `stat/list`；只提供 `.md` 文件，文件打开时再次做 `nodeId/revision` 校验，以 `readRange` 最多读取前 256KiB。重载、切换文件与返回目录维持当前状态。支持 `idle/loading-directory/loading-file/ready/stale/error`，异步结果用请求 token 防止过期回写。
- 无正文编辑与保存。顶部明确标示 **只读模式**；内容截断须注明“只加载部分内容”，不会在预览误称整份文件完备。

## 分阶段边界：v2 全量主界面并未迁移完成

这一步仅实现了工作台入口、真实目录与真实 Markdown 的 v2 三组件读写**只读**闭环。v2 `workspaceMachine` 的章节/注释/分句/翻译/审计完整状态机尚未迁入。当前 Mac v3 服务不支持 `replace-file` 原子覆盖，且外部 Obsidian/iCloud 修改需带版本协调，因此当前不能安全启用 v2 保存按钮或编辑态；绝不通过 v2 旧 ChapterRepository 假写入，也绝不静默丢弃用户改动。

后续航点：WP5 提炼 v2 工作区 `ChapterRepository`/`workspaceMachine` 的目录与章节加载适配层，迁移实际业务模块及 Sidecar；WP6 在 v3 文件服务完成 CAS 写入、冲突副本和失败恢复后才开放原文编辑、保存、Undo/Redo 等写操作；WP7 加入 PDF/媒体在公网的 Range/异步预览和移动性能验收。每步使用临时真实磁盘，保护 Obsidian 库原文件。

## Feature / UIC 合同与人工审核

- `FC-V3-WP4-001` 操作：单击目录行→「设为工作目录」。需要：已授权真实 Mac Vault 根及目录。效果：打开新「工作台」标签、显示真实目录路径与 Markdown 文件选择器；原目录页 AG Grid 状态保留。禁止：进入文件路径、自动修改库文件。固定样例：临时 `/ocr2md/workbench-example.md`。自动：`npm --prefix ui-spikes/v3-directory run test:ui`。人工审核：**待审核**。
- `UIC-V3-WP4-001` 初始：未选择目录，工作台标签隐藏。动作：选中目录并点击设为工作目录。预期：标签可见且切换、所选文件可见、加载态有文本反馈。数据副作用：GET `stat/list`，绝无写入。不变量：真实 Mac Vault 的 nodeId/revision 未改。自动化：Chrome real-disk E2E；iPad Safari 手势为 manual-external。
- `FC-V3-WP4-002` 操作：工作台选择 `.md` 文件。需要：工作目录中存在真实 Markdown 文件。效果：v2 校对 AG/CodeMirror/Markdown Preview 三组件显示对应文本块、原始 Markdown 及渲染；源码不可编辑；状态由加载到只读就绪。禁止：把截断视为完整、把未写入内容当已保存。固定样例：`workbench-example.md`，标题+段落+`<br>`。自动：同 E2E + 真实生产 Mac 只读公网 Chrome 设备尺寸测试。人工审核：**待审核**。
- `UIC-V3-WP4-002` 初始：工作台目录就绪、无文件选中。动作：选择 Markdown → 回目录 → 再进工作台。预期：AG/源码/预览一致且可继续选择；源文件没有改动。网络失联/文件变更应显示错误或 stale，禁止静默保存。自动化：临时真实磁盘 + 公网 read-only。人工审核：**待审核**。

注意：本阶段不可声称“v2 各种状态管理完整移植”；目前明确是其**只读工作台核心组件和加载状态**完成接入，覆盖修改保存需后续验收。
