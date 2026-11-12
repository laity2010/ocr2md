# Lab OCR · CMD Span API（实验契约）

本文件只登记 Span 生成 API；新增的 Block 生成 API 另见 `docs/contracts/lab-ocr-block.md`。两者均为 Lab 实验，不代表 Main 已实现。

| API | 实现 | 调用方 | 直接测试 |
|---|---|---|---|
| `minerujson2span(book)` | `scripts/v6_lab_ocr_span.py` | `POST /labs/lab-ocr/api/ocr/minerujson2span`；Lab 初次初始化及既有数据加载时幂等调用 | `python3 tests/lab-ocr-span.test.py` |

输入：已导入 `minerujson` 表的单书工作目录。输入源来自其只读 `source.original_bytes`，逐个 SHA-256 校验。

输出：在同一 SQLite DB 内生成独立 `span` 表，**para_blocks 及其子块的每个实际 span 一行**，含 `span_id`、`global_page`、`local_page`、`block_group`、`block_id`、`parent_block_id`、`block_path`、`block_type`、`block_bbox_json`、`line_index`、`line_bbox_json`、`span_index`、`span_type`、`span_bbox_json`、原始 `span_json`、各级原始属性与内容载体 (`content`、`html`、`image_path`)。遍历 `block.blocks[]` 的任意嵌套，块无 Span 不生成伪 Span。原始 JSON 所有其他字段仍留在 `minerujson` 的完整 source BLOB；没有将该表宣称为独立可复原全部 MinerU JSON 的唯一来源。

副作用：仅新增或重建派生 `span` 表；签名一致但包含非 para 行时在事务内原位删除它们，保留 para 原 Span ID；之后再次调用幂等。新数据写入采用 SQLite 事务，失败回滚。绝不改 JSON/PDF 输入或 `minerujson` 表内容；原始输入恢复通过已批准的重新初始化流程。

现有通用 **GET `rows`** 支持 `table=span` 读取分页，不算第二个 Span 生成 API。导航 `SQLite → span` 读取全部行，先加载到 CM6 `StateField`，AG 仅投影和筛选；点击 AG 行更新 CM6 的选中 Span 与只读源码内容。当前 PDF 和 MD 预览尚未定位联动；CM6 编辑回写属于后续的 `mdToSql`，本 API 不隐式进行写回。

验收：合成样本涵盖正文、排除废弃块、嵌套图片/表格、行内公式、未知属性、两种媒体字段、无 span 的块、分页、幂等、源哈希不变；浏览器回归覆盖 Chromium/iPad-WebKit。接口与事件状态限定在实验 Lab，未应用至 Main。

**WCP40**：独立 `span` 只处理 para，不把 preproc/discarded 放入新的派生表；`rows?table=span` 与 PDF Span 覆盖框均由 SQL 限制 para。原始 MinerU 数据未修改；旧三组原位收敛见 `tests/lab-ocr-para-only.test.py`。
