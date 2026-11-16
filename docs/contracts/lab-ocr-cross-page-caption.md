# Lab-OCR 跨页合并原文恢复

## 唯一来源与派生状态

- minerujson.original_bytes 是不可改写的 MinerU 源；preproc_blocks 与 para_blocks 均保存其中。
- block 是 SQL VIEW；人工 BlockID、PBS、父子关系、历史只由 block_review 提供。不能为恢复原文全量重建。
- para_blocks 中 lines_deleted=true 且 lines=[] 表示 MinerU 曾做合并，绝不代表必然丢失。其它段落、表格正文、脚注可能已经合并到另一块，不能批量重加。
- 默认仅对缺失的 table_caption/chart_caption，按同一来源、页码、根块类型与 bbox、子块类型与 bbox 匹配 preproc_blocks 的唯一非空原文。匹配零个或多于一个则不自动恢复。恢复后的 block_json 可显示文本，content_source='preproc_caption'；原始 lines_deleted 标志仍在。其它删除块标记为 para_deleted。
- 新 VIEW 的 CTE 不强制物化，保持页码过滤和 BlockID 点查询速度；原始 MinerU JSON 不被修改。
- **跨页合并的表格正文/脚注**由独立的 `block_source_link` 派生来源指针表管理（仅保存 BlockID、preproc JSON 来源指针及状态，绝不复制用户正文）。仅当相邻页同一表的 preproc 两段 HTML 行与 para 合并 HTML **逐个 tr 精确可逆**、唯一匹配时，才将第4页/第5页的 `table_body` 分别指向两页原始表格子块；脚注若完全匹配第5页原文且第4页 preproc 无脚注，则第4页对应误归属逻辑块改为空源，第5页独立逻辑块指向原始脚注。其它 `lines_deleted` 块绝不盲目填充。

## 构建与存量修复

- 新书从 initialize_block_projection 构建即可使用修正规则，后续初始化 MD 自动包含页上真实的续表标题。
- 已有人工校订书籍只调用 refresh_block_view，保留 block_review/MD 原有实体及历史；禁止重新运行破坏性 Block/MD 初始化。
- 旧 MD 里遗漏的标题使用 v6_lab_ocr_reconcile_captions.py：先做线上 SQLite 备份，检查缺失确凿且插入处两侧存在明确空白分隔，使用 persist_md_splice 的 CAS 写入，不覆盖人工正文。行或来源有歧义则拒绝操作；重复运行不重复插入。
- 本样本 `p5b0s0`（148）续表标题已在上一修复新增。**后续修复**将 16 个 `<tr>` 的合并 HTML 精确拆回第4页与第5页的各 9 行物理表格（两页均印有表头）。`p4b0s2`（133）只保留第4页 HTML，`p5b0s1`（149）获得第5页独立 HTML；`p4b0s3`（134）的误归属脚注从逻辑块视图撤下，已校订的 MD 脚注原行直接迁至 `p5b0s2`（150），只改 BlockID 与位置，不改文字。保留所有旧 LineID、其他 MD 行、BlockID、人工关系和审阅历史。
- 在已有人工校订的书籍，先做 SQLite online backup，运行 `v6_lab_ocr_reconcile_cross_page.py --apply`。其 `plan_table_split` 只对原始合并 HTML 完全一致、旧 MD 原行位置和标题/分隔行结构完全吻合的组合启用 CAS 修改；任何自定义修改或来源歧义均中止，不覆盖人工内容；再次运行幂等。

## 验证

- tests/lab-ocr-cross-page-caption.test.py：新建、旧书刷新、来源歧义、CAS 恢复及幂等。
- tests/lab-ocr-cross-page-split.test.py：跨页 HTML 表格精确拆分、误归属脚注恢复、保留人工更正文与所有 LineID、重复执行幂等、非严格匹配时拒绝修复。
- tests/lab-ocr-block-view.test.py、lab-ocr-md-store.test.py、lab-ocr-cross-page.test.py 和 lab-ocr-md-full-source.browser.test.mjs 回归相关模块。
MD 的人工编辑仍由 CM6/SQL 行表作为唯一可写权威；Block 来源恢复不得静默覆盖 MD。
