> **后续更新（2026-10-08）：** 右侧现在只保留源码窗，元数据改为源码内详情；AG Grid 改为所有列的 All 多选筛选，移除独立搜索框。详见 `WP3-AG-ALL-FILTER-SOURCE-ONLY.md`。

# WP3 — v3 工作目录：AG Grid + 源码双窗（2026-10-08）

## 需求和组件复用

`https://ocr2md.laity.bid/v3-directory/` → 「工作目录」保留真实 Mac Obsidian Vault 作为唯一后端，不再只有目录 AG 表。主工作区采用与 v2 相同的双窗模式：**左 AG Grid、右只读源码窗口**；「设置」继续复用 v2 的 TableConfigurationGrid/CodeMirror JSON 配置表。

- **AG Grid：** 保持工作区真实目录（类型、大小、时间、版本）、首行固定「返回上级目录」、点击目录进入子目录、目录上方显示完整路径、名称筛选/分页。
- **右侧源码：** 直接构造 v2 的 `WorkingEditor`（CodeMirror，Markdown 语法着色、行号、只读）。显示当前选中项的路径、种类、字节数、修改时间、版本及 nodeId。
- 选中 Markdown/TXT/JSON/YAML/CSV/代码等文本文件：自动从现有 `V3DirectoryController.previewFile` → `MacVaultHttpFS` `stat` + versioned `readRange` 获取**真实 Mac Vault 文本前 256KiB**，在右侧源码窗展现；超限显示「部分内容未加载」。前端不加载完整大文件，不新增服务接口。预览不是编辑，不允许写回。
- 选中 PDF、图片及非文本：不把二进制当 UTF-8 源码，右侧以结构化 JSON 显示文件元数据，后续扩充专门预览组件。
- 点击目录：左表进入目录；右源码窗显示结构化目录项目快照及目录元数据（节点/版本、列出项数量、内容，分页时注明当前页），不查询隐藏 `.obsidian`。返回上级或刷新也同步更新。
- **拆分条：** 复用 v2 `WorkspaceSplitter`，只新增可选 storageKey 参数用于 v3 专属左右宽度偏好键；v2 原有参数和宽度设置行为不变。
- iPad 宽屏两列可拖动；窄屏（≤760px）AG 在上、源码在下，独立滚动，无遮挡。
- **竞争保护：** `previewEpoch` 保证用户快速切换文件后，旧的异步内容不能覆盖新源码；Controller 校验 inode+revision，禁止读到不同版本的正文。数据是唯读预览，不触发 Markdown 保存。

## 验收

- 临时真实磁盘 + 浏览器: 复用 v2 `WorkingEditor`/`WorkspaceSplitter`、Root 导航、目录 JSON、Markdown 源码自动展示、只读、PDF 二进制拦截、650KB 文件仅读取前 256KiB、创建文件并读回、复制与删除、设置表单/JSON 流程。
- v2 TypeScript typecheck/root compile、v3 文件服务 Python 契约、git diff check。
- 经公网 Chrome 的 iPad(834px)/iPhone(390px) 触屏尺寸：分别断言左右排列/上下堆叠、编辑器加载、真实 Obsidian 文件内容只读预览、无水平页面溢出。

### 未包含在本次航点

- **源码正文修改后保存**：当前 v3 Mac FS 不提供 `replace-file`，不可假装已支持覆盖文件。保持只读并保护原有 Obsidian/iCloud 数据。
- PDF 图形渲染：本航点只提供结构化元数据，后续按需要独立接入高性能 PDF Viewer。
- iPad 本地库直接访问：当前 iPad Safari 公网路径仍经 Mac 文件服务，真实 iPad Safari 物理触控需用户验收。
