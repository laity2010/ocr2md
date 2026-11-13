# Lab OCR · CM6 唯一运行态 / SQLite 异步持久化（WCP42）

> 覆盖 WCP41 即时 SQLite 结构写入路径。Lab OCR 是框架型隔离实验：**Main 不变**。
> 只操作 para Block 关系，不编辑原始 MinerU JSON/PDF/Span 或 OCR Block 的 source key、bbox、lines/content。

## 1. 数据唯一权威

| 状态 / 数据 | 唯一可写权威 | 只读消费者 |
|---|---|---|
| 已加载书籍的 para Block 完整行及父子关系 | CM6 `structuredRuntimeField`（嵌入同一个源码 EditorState） | AG Grid 行、PDF PBS/overlay、CM6 表视图 |
| 排序、PBS、当前 BlockID、Undo/Redo 历史游标 | CM6 同一 StateField | AG/PDF 和工具栏按钮 |
| 尚未落盘的操作队列与 SQLite revision ack | CM6 同一 StateField | 后台异步 transport |
| 原始 MinerU JSON/PDF 与来源字段 | 原始文件 / SQLite 源 BLOB（只读） | OCR 数据导入/预览 |
| 已完成落盘的结构关系、历史和幂等回执 | 书籍专属 SQLite（持久副本） | 会话首次载入/刷新恢复 |

共享 Lab Frame 只提供通用 `readStructuredRuntime()`、`replaceStructuredRuntime()`、`reduceStructuredRuntime(pureReducer)`，并不导入 OCR 逻辑。业务规划是纯 JS 模块 `ui/lab-ocr/block-runtime.js`；CM6 StateField 持有唯一可写状态。AG/可见源码视图只是投影，不存第二份可自行修改的关系。切换导航到 Span/MinerU 时 CM6 的 Block runtime 不会丢失，再切回 Block 不从 SQL 重新读取旧关系。

首个会话载入时从 `rows?table=block` 导入全部 para Block（当前 10000 行上限；超限拒绝不完整编辑）；同时从 SQL `block-edit-state?history=1` 读取 revision 和最近 128 个持久化历史条目。之后编辑和 Undo/Redo 均在 CM6 同步完成，不等待任何 HTTP 结果。

## 2. 交互与投影

- PDF 拖动目标块覆盖框使用与点击选中框**完全相同**的 `outline:2px solid #ffd46c; outline-offset:1px; background:rgba(231,183,83,.20)`，不再用青色。
- 松手执行纯 `editBlockRuntime({action:'apply',sourceBlockId,targetBlockId,placement})`；改变对应的 CM StateField，并**立即**对 AG Grid/CM 可见行按 BlockID 做行补丁。
- PDF 原始覆盖几何缓存不更改；新的 `projectPage` 从 CM6 读取当下 PBS 与 ParentID，`repaintOverlayPage(page)` 仅使用缓存重新画受影响页；既不重新下载 PDF，也不从 SQLite 读旧 Block。即使后台 SQL 尚未写入，PDF 绘制仍与 CM 一致。
- Undo/Redo 使用 CM 中保存的页面关系 before/after 快照立即恢复，并追加持久化意图。失败或冲突不做静默回滚。
- 首次载入之外 SQL 不驱动 Block 关系。书籍切换/重新导入前必须先成功 flush 或拒绝覆盖 CM 未持久状态。

## 3. 闲时与手动保存

后台 transport `ui/lab-ocr/block-persistence.js` 不持有可修改 Block 数据；它只保存一个正在执行的传输批次编号、网络状态和闲时定时器。

- 最近一次 CM 结构改动后约 **1050 ms** 无后续操作，触发异步提交。连续编辑、Undo/Redo 会合并为不超过 32 个操作的批次；后台以单个 SQLite 事务处理，并在 CM 的待保存队列上做前缀确认。
- 点击**全局保存**（即使 settings.json 从未打开）立即触发当前待保存批次；如果已有请求在途，则串行等待并继续处理剩余操作。成功后 CM 仅删除已确认操作，不使用 SQL 覆盖当前行。
- `POST block-edit-batch` 接收 `{workspace,batchId,expectedRevision,operations}`，必须有 Main 编辑 Cookie、合法 Origin 和已授权书籍目录；同一个批次编号 + 相同操作在丢失 HTTP 回执后重发，只返回第一次 SQLite 持久化回执，不会重复执行 Undo/Redo。
- SQLite 在 `BEGIN IMMEDIATE` 事务里验证来源指纹 + `expectedRevision`；事务内执行有序 `apply/undo/redo`，校验完整历史快照与外键；全部成功才更新 revision 和 `block_edit_receipt`。任何一步失败，整批回滚。
- HTTP 失败保留 CM 全部关系、历史与未确认意图；用户再次点击保存，发送原始批次编号继续尝试。若是其他会话造成 revision 冲突，阻止自动覆盖并在全局状态栏报错，CM 关系保留供人工处理。
- 标签或导航操作不会自动重建 Block 表。切换到不同书籍必须 flush；无法确认落盘则禁止切换，不能以 SQL 陈旧数据覆盖 CM 状态。切到其它 SQL 标签只是 CM 视图变化。

## 4. 恢复与边界

- 已成功持久化的关系和 Undo/Redo 从 SQLite 读取；超过最近 128 个历史操作以前的记录仍保存在 SQL，但本次 CM 会话不提供超过加载边界的即时 Undo。
- 普通离开页面/切换到后台时尽力触发带 `keepalive` 的异步 flush，`visibilitychange` 与 `pagehide` 共享同一批次幂等回执。**强制终止浏览器或断电发生在闲时落盘前**的修改仍可能丢失；即便 `keepalive` 也不保证强退后一定提交，不声称仅依赖 CM 内存拥有崩溃恢复能力。本阶段没有将私有完整 OCR 正文复制到 localStorage。
- 旧同步 `POST block-edit` API 为兼容保留；任何绕过 CM 修改 SQL 的外部写入，都必须通过 revision CAS 触发冲突，不能静默覆盖已编辑页面。
- 目前仍限同页 para 的顶层父块排序/归入与同父兄弟排序；子块跨父、跨页、拆独立父及虚拟 s0 内容实体化仍不开放。

## 5. 直接测试和集成门禁

- `tests/lab-ocr-cm-block-runtime.test.mjs`：完整 Block 行、纯关系计算、CM 历史、增量 Ack、不改变原始数据。
- `tests/lab-ocr-cm-deferred-persistence.test.mjs`：连续编辑即时生效；网络失败后 CM 保留 queue；重复批次编号重试成功。
- `tests/lab-ocr-block-edit.test.py`、`lab-ocr-block-edit-http.test.py`：SQLite 原子批量、CAS、幂等回执、Undo/Redo、外键、原始 JSON/PDF/Span 字节守恒、HTTP Main 授权/Origin。
- `tests/lab-ocr-block-gesture.browser.test.mjs`：Chromium + iPad WebKit 真实 PDF.js/AG/CM6；落点与点击框计算样式相等；拖动立即变更而 SQL 仍旧；闲时后台落盘；未保存 Undo 跨 Span/Block 导航保持；掉回执失败、全局保存幂等重试；重新载入恢复已持久结构与历史；PDF/SQL 不在拖动时全量刷新。
