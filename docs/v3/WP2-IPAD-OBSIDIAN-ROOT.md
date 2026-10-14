# WP2 实际 iPad Obsidian Vault Root 验收入口（2026-10-08）

## Root 事实

目标 Obsidian Vault 在 iPad/iCloud Drive 的预期位置：`iCloud Drive/Obsidian/ocr2md/`。整个库是 Workspace Root `/`，其内 `ocr2md/` 才是 OCR 清洗工作区；`books/`、`tools/` 等根级目录是 Obsidian 真实目录，由用户维护。不要把 "/ocr2md/ocr2md" 混作 Vault Root，也不要将 Mac 上的同名镜像误称 iPad 本地已验收。

Safari 的 IndexedDB 工作区不能直接读写真实 Obsidian Vault。作为比新建 iPad 原生 App 更小的门禁，采用 Obsidian 社区移动插件（运行于 iPad Obsidian 应用内部），直接读取 `app.vault`。这条路线初期 **不会让外部 Safari 网页拥有 Vault IO 权限**。

## 已实现 / 已放置

源代码：`ui-spikes/v3-vault-plugin/src/main.ts`、`pathGuards.ts`

最小 Obsidian 插件包：`manifest.json` + 构建后的 `main.js`，`isDesktopOnly:false`。

在 Mac 可见的现有 iCloud Vault 中**仅新增**：

`<Mac iCloud Obsidian Vault Root>/.obsidian/plugins/ocr2md-v3-vault-probe/`

该安装目录是通过 Mac/iCloud 同步面向 iPad 的插件交付，**未更改 community-plugins.json，不自动启用插件，不重启 Mac/Obsidian，不接触其他插件**。

插件的独立视图功能：
1. 显示 `app.vault.getName()` 并强制目标库名精确为 `ocr2md` 才准许写测试文件。
2. `app.vault.getRoot()` 用作真实 `/`，读取该目录的真实 `TFolder.children`，可进入子目录、返回 Root；默认不展示 `.obsidian` 等隐藏目录。
3. 检查 `app.vault.getFolderByPath('ocr2md')` 确实存在；没有则不自动创建、不执行写入。
4. 仅在用户勾选确认并点击后执行 `vault.create('ocr2md/_wp2_vault_probe_<timestamp>.md', expectedText)`（只新建，不覆盖），随后 `vault.read(file)` 字节文本一致性验收。
5. 结果显示真实文件的路径，供 iPad Obsidian 左侧文件树和后续 Mac iCloud 端核验；不会自动删除、改名、递归操作任何真实用户数据。

## 执行验证及局限

- 构建命令：`npm --prefix ui-spikes/v3-vault-plugin run build`，esbuild 成功输出 8.4 KB `main.js`。
- `cd ui-spikes/v3-vault-plugin && node tests/pathGuards.cjs` 路径保护测试通过。
- 已核验 Mac Vault 内 `main.js`、`manifest.json` 与源码构建输出 SHA-256 完全相同。
- 当前 Mac 没有 Xcode 或有效 iPad 开发签名，AgentDock devicedebug 未检出近期真实 iPad 浏览器会话；**尚未在 iPad 上启用插件或执行真实 Vault IO，不得声明 iPad 已验收通过**。
- Obsidian mobile 插件 JS / iCloud 插件同步在 iPad 上的表现应以实机反馈为准。

## iPad 人工验收

1. 打开 iPad Obsidian，确保当前库名为 `ocr2md`；等待 iCloud 同步插件文件。若未显示插件，检查 `文件 → iCloud Drive → Obsidian → ocr2md → .obsidian/plugins`（隐藏目录可能不显示，使用 Obsidian 插件管理页为主）。
2. Obsidian 设置 → 第三方插件/社区插件 → 找到 `ocr2md v3 Vault Root Probe` → 启用。**此操作必须由用户明确执行**。
3. 命令面板搜索 `打开真实 Obsidian Vault Root 验收`，或点击文件夹放大镜 Ribbon 图标。检查根目录应出现真实的 `ocr2md/`、`books/`、`tools/` 等，而不是固定的示例书/阅读/学习。
4. 点进 `/ocr2md/`，确认看到实际书籍工作目录。完成**只读**验收后，再决定是否勾选并运行真实单文件写入。
5. 运行写入后，查看新建 `_wp2_vault_probe_<timestamp>.md`，并在 Mac 同一个 iCloud 库检查是否同步到达。若 iCloud 暂未同步，不应把 Mac 延迟误判为 iPad 创建失败。

## 下一门禁（未实现）

当前插件仅证明真实 iPad Vault Root 可被读取以及用户确认下的单文件写入路径。它尚未连接公网 v3 Web UI/`WorkspaceFSV3`，因此：
- 直接打开 Safari `https://ocr2md.laity.bid/v3-directory/` **仍使用 IndexedDB**；这条 URL 不能代表真实 Obsidian Root。
- 下一步若插件在 iPad 验收通过，可以用插件内受严格来源约束的 iframe + postMessage 或由 Obsidian View 直接渲染 Web 工作台，将 Obsidian Vault API 映射给 v3 WorkspaceFS；对每类写入操作、版本冲突、文件协调和现有 Obsidian 索引维护须单独通过合同测试。
- 绝不可把外部未经验证的网页请求直接当作文件系统命令执行，也不可默默开放 `.obsidian` 写权限。
