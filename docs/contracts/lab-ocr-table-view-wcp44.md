# WCP44 · Lab-OCR 表格 AG View（只读）

## 用户目标及真实数据依据

- AG View 下拉新增「表格」，筛选**所有** `block_type` 包含 `table`（忽略大小写）的 Block，每 Block 一行。不靠 Markdown 源码中有没有 HTML `<table>` 判定，也不额外加入 Chart 等类型。
- 只读核对 2026-11-16 Buffett 实验 SQLite 样本 `block` 表：`table` 9、`table_body` 9、`table_caption` 8、`table_footnote` 6，共 32 块；其中 12 块没有直接对应的 `md_line`，1 块为历史合并 Wrapper。**这三类记录都要保留**，不因无 MD 行或合并吸收而丢失。

## 数据权威与 View 规则

- 真正的 Block 权威是已有的 CM6 Structured Runtime（基于 SQLite Block 表）；MD 行唯一权威仍是现有 CM6 Markdown；PDF 覆盖框沿用原来的 BlockID 关联。
- 公开只读投影 API `projectTableBlockRows(mdRows,blockRows)`：过滤 Block 类型，保持原始 `block_id/pbs/block_type/content_preview/global_page/parent_block_id`，并从**同一 BlockID**的第一条 MD 行附加 `line_id/line_no`。无直接 MD 行则明确返回 `null`，**不能借用邻块或子块源码行**。
- 历史合并的 Block 行须显示：投影保留其 `merged_into_block_id`，移除原 `absorbed_into_block_id` 筛选标记，以免共享 AG Grid 的默认 active-only 规则将它隐藏；这仅影响只读 AG 行，不触碰结构运行态或底层 SQL。
- 使用原有 Frame AG Grid，不建立第二份表；默认按 PBS 可排序，仍保留 Block Type、摘要、源码行、PDF 页、BlockID、父 BlockID、合并目标 BlockID、BBox 等列。允许现有 AG 列值过滤。
- 点击有 MD 行的子块，调用既有 `locateReview` 四窗定位；无独立 MD 行的表格父块仍按真实 BlockID+PDF 页聚焦 PDF，但不得显示虚构的 MD 源码位置。表格 View 的状态栏明确区分这两种情况。
- View 按 Block 粒度只读。普通源码字符改动不重建 Grid；只有 MD 行位置、PBS 或结构关系变化时，才重投影以刷新 AG 的位置元数据。不新增 SQL 表，不保存 View 自身状态，不修改书籍、媒体或 PDF。

## 定向验收

- `node tests/lab-ocr-table-view.direct.browser.test.mjs`：独立 API 合约，Chromium+iPad WebKit，检查 table 类型全集、无 MD 行父块、历史合并块可见、BlockID/LineID/PBS 关联、PDF-only 定位契约及输入无副作用。
- `node tests/lab-ocr-table-view.browser.test.mjs`：真实 AG 和 CM6 的合成书籍集成；检验 View 选择、仅 table 类型、全部父子/合并块、PBS 排序、子块源码定位、父块 PDF-only 状态以及没有任何 SQL 写操作。
- 只读真实 SQLite 样本：`projectTableBlockRows` 应返回 32 行，类型数量 `9/9/8/6`，包含 1 条合并块，并且所有行有 PBS。
- 影响回归：Frame 的模块选择/AG、注释与媒体 View，以及 Lab-OCR 公网 WebKit 启动。**不动已恢复正常的启动入口**。
