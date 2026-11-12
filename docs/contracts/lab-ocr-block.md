# Lab OCR · CMD Block API（实验契约）

新增公开 API `minerujson2block(book)`，实现 `scripts/v6_lab_ocr_block.py`；HTTP 路径 `POST /labs/lab-ocr/api/ocr/minerujson2block`，直接契约测试 `python3 tests/lab-ocr-block.test.py`。

从已导入 `minerujson` 的只读 `source.original_bytes` 解析所有页面，但**只将 `para_blocks` 及其嵌套 `blocks[]` 派生为 SQLite `block` 行**。原始 `preproc_blocks` / `discarded_blocks` 仍保存在 MinerU 来源 BLOB 与溯源表；SHA-256 验证通过后事务生成派生表，绝不改原始 JSON/PDF。

- `block_id` 为简短的 SQLite 整数主键（本次来源快照内稳定）；`parent_block_id` 引用父块整数 ID，`NULL` 表示顶层。`pbs` 是由 MinerU **原始块顺序**推导的可读标签 `p{page+1}b{block_order}[s{child_order}...]`，para 源阶段内唯一；它是本 Lab 的结构编号，不冒充 Main 已人工调整、可能含前导零的正式 CMD PBS。`source_block_key` 保留旧的完整路径 `sN:pN:group:bN.N`，供原始 Span 表的 `span.block_id` 关联，不把位置塞进主键。
- `block_json` 保存**该块除子 `blocks[]` 外的完整字段**，尤其原封保存 `lines[] → spans[]` 的所有类型、正文、bbox、媒体路径及未知属性。`has_blocks_field` 保留原 JSON 是否显式出现 `blocks` 字段，所有子块通过 `parent_block_id` 和 `sibling_order` 还原，避免可写内容重复。
- `line_count`、`span_count` 仅统计当前 Block 自身内容；父块不复制子块数据。`content_preview`、`span_types` 只用于 AG 分类预览，不是权威内容。
- 页面级其它字段与顶层文件元信息仍保存在 `minerujson` 来源 BLOB；因此本 `block` 表不独自承诺复原全部文件的全部顶层元数据，但其 Block 层级可无损还原。

已有 GET `rows?table=block` 提供分页读取。导航 `SQLite → block` 点击后批量读入 CM6 `StateField`，AG 为分类筛选投影；点击 AG 行时 CM6 显示选中 Block 自身完整的 JSON（含 Line/Span），AG 展示 PBS、短 BlockID 与 ParentID（即 SQLite 的 `parent_block_id` 整数外键），全局状态栏显示 PBS/BlockID/ParentID/bbox。父子引用只根据 ID 建立，绝不通过可变的 PBS 连接。无 PDF 高亮和 MD 重组、无 CM6 修改回写（属于后续 API）。

验收：合成源包含全部三个原始组但只派生 para、嵌套表格/图片/空块、span 多值、额外属性、幂等、逐块重组一致、原始文件哈希不变，且已有 `minerujson2span` 继续可用；真实 sample 校验所有 Block 数量、Span 总数与父路径有效性；Chromium/iPad-WebKit 复用现有 Frame 和导航浏览器测试。

**WCP40 迁移**：同源 SHA 的旧三组 `block` 表仅在事务内删除非 para 行；保留 para 的原整数 BlockID、ParentID、PBS 及已有修改。重新构建时仍按历史三组深度优先序预留编号，但不插入其它组，因此 BlockID 可以不连续。`rows?table=block` 始终限定 para，且不再显示块组筛选。`tests/lab-ocr-para-only.test.py` 验证旧表迁移、原文件哈希与 ID 不变。
