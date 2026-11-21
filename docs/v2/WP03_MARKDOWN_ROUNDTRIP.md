# V2 WP03 · 无标签 Markdown 只读投影与严格往返

起点：WP02 `f939010`。只对已有 `logical_block` 最新状态执行只读重构；**没有**改写基础表、逻辑表、MinerU、PDF、另存 `.md` 或新增第三物理表。新业务端口 `GET /labs/lab-ocr-v2/api/mineru-base/markdown?workspace=...`，仍经过 Frame F02 独立 Cookie 与允许目录校验，拒绝未授权读取。

## 双向契约

`v2_markdown_roundtrip.to_markdown(rows)` 输入已校验、按 `logical_order` 1..N 升序的逻辑块，在内存中生成：

1. **`markdown`**：只读原始 Markdown 字符串，以 `\n\n` 分隔相邻逻辑块；不加 CMD/HTML 标注或可见分隔框。空块仍占据逻辑顺序但未伪造文本。
2. **`segments`**：随此次投影返回的独立内存映射清单，包含每个块的 `logicalId`、`baseBlockId`、`parentId`、`logicalOrder`、`blockType`、`startChar/endChar`（Python 字符下标）与 `startUtf16/endUtf16`（供未来 CM6 坐标映射使用）及片段 SHA-256。
3. **`sha256`、`rowCount`、`lengthUtf16`、`schema`**：严格核验与防过时投影；位置清单只返回前端内存，不写入 SQLite/JSON/MD 文件。

`from_markdown(snapshot)` 验证：全文/片段 SHA、块边界、分隔符、Unicode/UTF-16 坐标、连续逻辑顺序、稳定 ID、来源 ID、父节点存在和无循环，重新产生**与原 SQL 完全一致**的六字段逻辑行（包括当前 `block_type`）。导出 API 本身执行 `from_markdown(to_markdown(rows)) == rows` 后才返回。任何内容修改或无位置清单的裸 Markdown，一律**不能**冒充无损还原：WP03 不支持 Markdown 编辑/回写，后续 WP04/05 必须实现受控编辑和增量持久化后才允许写回。

**重要区别：**“无损往返”仅指 `logical_block → Markdown + 外部定位清单 → 同一批 logical_block 行`，**不是** `Markdown → 原始 MinerUJSON 的全字段原样恢复`。后者唯一的权威始终是 `mineru_base.block_json` 和 `blockid=0` 的原始字节档案。初始投影内容来源于 WP01 的保守规则，尚不等价于 V1 的全部排版/表格跨页修补，也不自动推断块的父子关系或合并跨页。

## 界面及门禁

- SQL 导航/AG 仍是原有一套组件。在 `逻辑表` 已有数据时显示「查看 Markdown」按钮；点击 GET 后只向**已有的 CM6 Source EditorView** 注入只读文档内容，物理 Frame 源码不变；未新增 CM6 实例、可编辑状态、保存动作或第二个状态权威。工作目录变更时清空只读文本。
- HTTP 仅返回 8 MiB 以内的只读重构投影，超过上限明确报错；损坏顺序、空引用、关系环、缺省文本、源库缺失或未初始化均拒绝，绝不默默丢块。
- WP03 direct tests 覆盖真实 22 页 fixture 224 块、空块、标题、公式/图片/HTML 表、正文无标签、中文和 Emoji UTF-16、哈希篡改、位置变化、断链/父子循环、未授权访问、无数据返回、原 SQL 与 MinerUJSON 字节保持不变。Chromium/iPad-WebKit 验证 read-only CM6 窗、AG/导航复用、按钮和原 WP00/02 功能。
