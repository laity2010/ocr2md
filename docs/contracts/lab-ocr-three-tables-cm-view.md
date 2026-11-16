# Lab OCR · 三核心表 + CM View / 独立公式源码契约

> 框架型 Lab 的渐进设计与本轮已实施范围。不是 Main 的生产承诺。

## 核心实体及唯一可写权威

| 业务层 | 现有实体 SQL TABLE | 内容 / 写入权威 |
| --- | --- | --- |
| 基础块 | `minerujson` | MinerU `original_bytes`、原始 `block_json` / 根块原样保存；只读原始证据 |
| 逻辑块 | `block_review` | 稳定整数 `block_id`、ParentID、PBS、同胞顺序、审阅状态、指向基础块的来源指针；CM6 的 `structuredRuntimeField` 是会话内权威，CAS 落 SQL |
| CM 物理行 | `md_line` | 一条 CM6 实际源码行一条 `line_id`、连续 `line_no`、`block_id`、`text`；空行也是完整记录；CM6 MD StateField 为会话内权威，CAS 落 SQL |

两个**只读 SQL VIEW** 不是持久化正文副本：
- `block`：`minerujson` 原始证据与 `block_review` 逻辑结构的组合（现有）。
- `cm_view`：`md_line LEFT JOIN block_review`，对每一物理行提供稳定 `line_id`、`block_id`、`pbs`、`parent_block_id`、`global_page`、`source_root_id`、`source_json_path` 等，只读且不解析 Markdown；`block_id=NULL` 的行仍显示。原始公式图片和 Markdown 正文不复制至该 VIEW。

**CM6/AG 实际编辑时**仍由 `mdRuntime()`、`structuredRuntime()` 和 JS 的 `projectLiveMdRows` 内存联接投影。不能为了刷新 CM View，反向用尚未更新的 SQL VIEW 覆盖 CM6 内存。SQL View 负责持久化后的定位、检查、恢复。`md-state` 通过 View 读取相同的四个物理行字段；旧书缺少 View 时只读 `md_line`，不在 GET 上默默迁移 Schema。

## 新书首次 MD 初始化（本轮已实施）

- 由经过审阅的 Block 树的根块和子块展开为物理行。**同一父块下的子块之间不额外插入空行**；不同顶层父块组之间由组装器插入一条空物理行，归前一块 BlockID。公式 / 围栏 / HTML / LaTeX 自身已有空行不得删；文件最后的换行也由末尾空物理行表示。
- 独立公式 `interline_equation` **优先使用 span.content 的 LaTeX**，输出 `$$`、公式实际内容、`$$`，再追加 `[原始公式图](<原 image_path>)`。原图采用点击后打开的链接，不把图片内嵌为第二个公式；所有生成行共用该公式逻辑 BlockID。多张原图链接逐个保留。异常的危险 URI 仅保留于无损原始数据，不作为可执行链接。若 TeX 含独立的 `$$` 定界行，则为了不错误截断，退回已有 `math` 围栏表示源文本。
- 如果原公式缺少 `content`，但有图片，保留原图链接，不伪造不存在的 LaTeX。原始 MinerU JSON 的代码和图片路径均保持字节不变。
- `cm_view` 在**明确的 MD 初始化写事务**中创建，旧书通过再次明确初始化（幂等）或下次成功的 MD CAS 写事务补上只读 View；已有 LineID、文本、版本及人工作业保持不变。

## 后续增量阶段（本轮不暗中扩大）

1. **WP1 · 显式新建逻辑块**：扩展 `block_review` 以支持没有 MinerU 来源指针的新 BlockID，并让 `block` VIEW 适配空来源块；新增顶层块时仅让所在页后续顶层 `b` 编号顺延，ParentID / LineID 不改变。新增子块只影响所属父块的 `s` 顺序。停用或软删除块不压缩 PBS，保留审阅与 Undo/Redo 证据。
2. **WP2 · CM6 编辑归属**：在单个逻辑块中 Enter、粘贴或插入公式只改变 MD 行；新行继承光标所在行的块（开头位置根据此前块），跨块选区不得静默吞并另一块。只有明确命令才增删/移动逻辑块；保证一 SQL 行严格对应一 CM6 物理行。
3. **WP3 · 旧书公式迁移**：现有已保存 MD 不重新执行转换；未来另做可预览 diff、可 Undo 和保留原始 LineID 对应的**显式校正**，不能借部署、刷新或原始导入自动覆盖已有人工文字。
4. **WP4 · UI 验收与模块边界**：AG 所见的 CM View 由 CM6 两套运行态的公开 API 联接，不重复保存。PDF 点击、AG 点击、源码编辑、Markdown $$ 预览、链接、撤销重做、保存/重载及 Chromium+iPad-WebKit 回归均验证。

## 本轮可执行验收

- `tests/lab-ocr-cm-view-formula.test.py`：只含三张业务实体及两个只读 View、同父兄弟无分隔、父块间空行 LineID/BlockID、公式代码优先 + 原图链接、旧书 MD 不覆盖、来源字节未改变。
- `tests/lab-ocr-md-store.test.py`、`lab-ocr-block-view.test.py`：原始无损和 MD CAS/旧库读写不倒退。
- `tests/lab-ocr-md-full-source.browser.test.mjs` 与相关 AG/PDF 浏览器回归：CM6 编辑、行号、PBS、标题及各视图不倒退；通过 $$ 预览实验验证公式 + 原图链接可见。
