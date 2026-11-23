# WP07 · PDF 拖放 → CM6 逻辑结构 → 空闲增量写回 SQLite

## 范围与单一数据权威

- 用户只在现有 V1 PDF 标签界面拖动逻辑块；**CM6 Markdown 源码窗只读，不开放文本键入/粘贴/删除**。
- 当前书籍仍只有 `mineru_base` 和 `logical_block` 两张物理表。基础表保留原始 MinerU 和 PDF 物理位置，任何拖放都不修改它。
- `logical_id` 和 `base_blockid` 恒定；`p、b、s` 是逻辑归属编号，`logical_order` 管 Markdown/CM6 正文序列；不按序号重新生成 PBS。
- 仅两层：父块分组 `pNbM` 与真实逻辑子行 `sK`。移动已有父组时随带其子块；跨组归入时压平至目标父组 `s1+`，不生成孙块。当前没有文本子块拆分/新建功能。

## 事件链路

1. 原版 V1 `mountLabOcrPdf` 通过 `onBlockDragIntent({sourceBlockId,targetBlockId,placement,page})` 发出拖放意图，接受 `before/after/child` 合法落点。
2. V2 的 `moveLogicalBlocks` 校验源/目标/PBS、只作局部关系与块序调整，返回完整 CM6 逻辑块内存投影和变更行清单，拒绝重复 PBS/孙块/不允许的落点。
3. 单个 CM6 `EditorView` 使用 StateField/StateEffect 承载逻辑结构；结构与文本块顺序在一个 CM6 transaction 更新，`invertedEffects` 接入原生 Undo/Redo。源码 DOM `contenteditable=false`；`changeFilter` 拒绝非结构正文变更。不能启用 `EditorState.readOnly=true`，否则 CodeMirror 命令也会禁用原生 Undo/Redo。
4. `v2-cm-session(kind=structure)` 驱动 AG 逻辑表的实时 PBS 和顺序投影、Markdown 重渲染、V1 PDF 缓存覆盖框的标签局部重画。PDF 坐标只读原始 MinerU bbox，保持原 PDF.js 实例。
5. 空闲约 850ms 后客户端用最后一次 SQL 确认状态与 CM6 最新结构比较，仅发送有变化的行（`logicalId`、`before`、`after`）。
6. `POST /labs/lab-ocr-v2/api/mineru-base/structure-commit` 保留 Frame F02 Session、Origin、工作目录校验和磁盘探针；SQLite `BEGIN IMMEDIATE` 中逐行校验旧值、临时避开 PBS UNIQUE 编号冲突、更新必要逻辑字段、验证两层关系及 FK，成功后原子提交。失败则 SQL 回滚、CM6 状态保留并提示，不静默覆盖他人修改。
7. 已保存的 Undo/Redo 是新的结构事务，空闲后同样增量写回。未保存期间禁止自动重载 V2，切换工作目录也被拒绝；无须依赖 iPad Safari 的离开页面弹窗。

## 验证 / 回退

- `node tests/v2-structure-move.test.mjs`：根块组保号重排、子块归入、兄弟子块交换、禁止无效层级。
- `python3 tests/test_v2_structure_commit.py -q`：真实 MinerU 两表独立 SQLite 文件，只更新逻辑字段、并发冲突、跨页归入、Undo 恢复、失败回滚和原始基础表逐行一致。
- `node tests/v2-mineru-base.browser.test.mjs`：Chromium 与 iPad-WebKit 测试只读源码、CM6 原生 Undo/Redo、空闲 SQL POST、AG p 过滤及基础表分页。
- `node tests/v2-real-markdown-preview.browser.test.mjs`：真实 V1 PDF 长按拖动标签到落点的 end-to-end 测试，标签身份与父子色系、原 bbox、单一 PDF.js、三窗↔四窗及 Undo/Redo。
- 只在隔离测试与 Git 回退点通过后普通 push、构建并通过统一发布器部署；V2 Python 修改触发**同一个** Gateway 刷新及 releaseId 健康检查。实机 iPad Safari 另做人工交互验收。
