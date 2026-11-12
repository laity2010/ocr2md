# Lab OCR · CMD Block API（实验契约）

新增公开 API `minerujson2block(book)`，实现 `scripts/v6_lab_ocr_block.py`；HTTP 路径 `POST /labs/lab-ocr/api/ocr/minerujson2block`，直接契约测试 `python3 tests/lab-ocr-block.test.py`。

从已导入 `minerujson` 的只读 `source.original_bytes` 解析所有页面、全部 `preproc_blocks` / `para_blocks` / `discarded_blocks` 及嵌套 `blocks[]`，每个 Block 形成独立 SQLite `block` 行。原始 JSON SHA-256 验证后，在单事务中生成派生表；匹配源指纹时幂等返回，不覆盖 `minerujson`、`span`、原始 PDF/JSON。

- `block_id` 由 `source_order`、`global_page`、`block_group`、递归 `block_path` 共同形成稳定路径；`parent_block_id = NULL` 表示顶层，子块引用父块。
- `block_json` 保存**该块除子 `blocks[]` 外的完整字段**，尤其原封保存 `lines[] → spans[]` 的所有类型、正文、bbox、媒体路径及未知属性。`has_blocks_field` 保留原 JSON 是否显式出现 `blocks` 字段，所有子块通过 `parent_block_id` 和 `sibling_order` 还原，避免可写内容重复。
- `line_count`、`span_count` 仅统计当前 Block 自身内容；父块不复制子块数据。`content_preview`、`span_types` 只用于 AG 分类预览，不是权威内容。
- 页面级其它字段与顶层文件元信息仍保存在 `minerujson` 来源 BLOB；因此本 `block` 表不独自承诺复原全部文件的全部顶层元数据，但其 Block 层级可无损还原。

已有 GET `rows?table=block` 提供分页读取。导航 `SQLite → block` 点击后批量读入 CM6 `StateField`，AG 为分类筛选投影；点击 AG 行时 CM6 显示选中 Block 自身完整的 JSON（含 Line/Span），全局状态栏显示 Page/Block/parent/bbox。无 PDF 高亮和 MD 重组、无 CM6 修改回写（属于后续 API）。

验收：合成源涵盖全部三个组、嵌套表格/图片/空块、span 多值、额外属性、幂等、逐块重组一致、原始文件哈希不变，且已有 `minerujson2span` 继续可用；真实 sample 校验所有 Block 数量、Span 总数与父路径有效性；Chromium/iPad-WebKit 复用现有 Frame 和导航浏览器测试。
