# Lab-OCR 跨页合并原文恢复

## 唯一来源与派生状态

- minerujson.original_bytes 是不可改写的 MinerU 源；preproc_blocks 与 para_blocks 均保存其中。
- block 是 SQL VIEW；人工 BlockID、PBS、父子关系、历史只由 block_review 提供。不能为恢复原文全量重建。
- para_blocks 中 lines_deleted=true 且 lines=[] 表示 MinerU 曾做合并，绝不代表必然丢失。其它段落、表格正文、脚注可能已经合并到另一块，不能批量重加。
- 仅对缺失的 table_caption/chart_caption，按同一来源、页码、根块类型与 bbox、子块类型与 bbox 匹配 preproc_blocks 的唯一非空原文。匹配零个或多于一个则不自动恢复。恢复后的 block_json 可显示文本，content_source='preproc_caption'；原始 lines_deleted 标志仍在。其它删除块标记为 para_deleted。
- 新 VIEW 的 CTE 不强制物化，保持页码过滤和 BlockID 点查询速度；原始 MinerU JSON 不被修改。

## 构建与存量修复

- 新书从 initialize_block_projection 构建即可使用修正规则，后续初始化 MD 自动包含页上真实的续表标题。
- 已有人工校订书籍只调用 refresh_block_view，保留 block_review/MD 原有实体及历史；禁止重新运行破坏性 Block/MD 初始化。
- 旧 MD 里遗漏的标题使用 v6_lab_ocr_reconcile_captions.py：先做线上 SQLite 备份，检查缺失确凿且插入处两侧存在明确空白分隔，使用 persist_md_splice 的 CAS 写入，不覆盖人工正文。行或来源有歧义则拒绝操作；重复运行不重复插入。
- 本样本 p5b0s0，BlockID 148，preproc_blocks 原表题含 (continued) 两行；p5b0s1/s2 内容已合并到 p4b0s2/s3，不能重新加入。修复 MD 预期新增 93–94 行，原有 LineID、BlockID 和结构历史不变。

## 验证

- tests/lab-ocr-cross-page-caption.test.py：新建、旧书刷新、来源歧义、CAS 恢复及幂等。
- tests/lab-ocr-block-view.test.py、lab-ocr-md-store.test.py、lab-ocr-cross-page.test.py 和 lab-ocr-md-full-source.browser.test.mjs 回归相关模块。
MD 的人工编辑仍由 CM6/SQL 行表作为唯一可写权威；Block 来源恢复不得静默覆盖 MD。
