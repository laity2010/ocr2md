# WP18 · CM6 逻辑块前缀错位事故与防线

## 现场只读证据（2026-11-23）

- 实际 V2 书籍 `sample/ocr2md.v2.sqlite` 两表仍为 540 行基础表（含档案）/267 行逻辑表，来源与 `packages/minerujson-md/fixtures/buffetts-alpha.mineru.json` SHA256 一致。**没有改坏 MinerU、base_blockid、PBS、原 PDF 几何。** 原 `para_blocks` 确实有少量 OCR 内部拼写错误（例如 `Bufet` 代替 `Buffett`），但本事故不是该问题。
- 从当前 `logical_order` 第 35 行（`p1b11s0`、逻辑 ID 73）的 `CE Credits: 1` 开始，SQL 的正文末尾多了 `\n\nM`；下一块 `p1b12s0` 的 `M<sup>uch...` 成了 `sup>uch...`；再后 `p1b13s0` 的 `Bufet...` 成了 `fet...`、`p1b14s0` 的 `In our study...` 成了 ` our study...`。全书原始与持久化对照共有 211 行差异。
- 利用 `mineru_base` 原始块、同页 `preproc_blocks` 的 WP15 真实表格恢复来源，以及事故现场**现有** `(p,b,s)` 与 `logical_order`，构造正常的 WP14B 文本投影。全书 `267/267` 行均符合**同一处 +2 UTF-16 块区间偏移**的封闭数学模型：第 35 行后重复把当前块起点当成 +2，使每个块丢掉开头两个字符，同时错误吞入后面的两字符分隔符／下一个块首字符。没有发现无法解释的人工正文编辑。此次损伤不能解释为“该页 OCR 原文缺了前两个字符”。
- **原件保全**：在对事故库动任何写操作前，使用 SQLite 只读连接的 `backup()` 保存独立完整备份 `.ops/backups/v2-prefix-drift-before-repair-20261123-204840.sqlite`，其 SHA256 为 `0b87e35b879302f19c2f41768931cfc778957670ad23e9767d8b0b1d7ed2d18d`，`PRAGMA integrity_check=ok`，两表行数原样。禁止手工全局重建或用重新导入覆盖修正现场。

## 防止再次损伤（V2 特有，不改 V1 Frame）

- 唯一 CM6 正文及其逻辑块身份不变。普通打字事务通过纯函数 `planOwnedTextEdit(source,blocks,changes)`：每个修改必须完全位于**一个逻辑块真实 MD text**（不包括 display-only `groupEndPad`），禁止编辑显示用 LF，禁止跨块删除/粘贴与回车。通过旧 MD 文本+实际变更在内存准确重组 267 个块，只当重组 `source` 与 CM6 新文档逐字节一致时接受，否则拒绝该事务，并通过全局状态栏提示。
- 不再用 `mapEditedBlocks` 的边界 `ChangeDesc.mapPos` 推断普通正文编辑的块位置；其旧实现的 `groupEndPad` 提升与左／右关联可以产生区间归属不一致的风险。新实现每次取 `composeLogicalSource` 的确切区间，避免整份文件某位置之后的 2 字符稳定错移；源文编辑仍是原生 CM6 history，**不是新编辑器或第二份可写 MD**。
- SQL 组显式「仅整理正文断行（不重建）」属于用户二次确认的多块操作；直接构成完整、类型化单次 CM6 历史并恢复每块的虚拟 LF，继续只写 `md_block`，不修改 PBS、原始 JSON。
- 预防回归：`tests/v2-prefix-ownership.test.mjs` 读取真实 267 块 MinerU 样本并复现 CE→M 相邻读序，遍历所有逻辑块的行首、行尾输入（含空块、子块、HTML、LaTeX），验证除编辑块之外其余 266 行原文不变；Backspace/Del 到虚拟 LF、跨块粘贴及换行全部拒绝。V2/AG/PDF 真实 Chromium/iPad-WebKit、WP15 表格恢复、WP17 文本层提取和跨版本过滤门禁必须继续 PASS。

## 恢复已损坏 SQL（与防线代码分开验收）

1. 用户当前工作书籍中的事故是**已落盘**的旧数据；光发布防线不能自动把这 211 行恢复。先核实事故库的用户原始备份完整，读取现有原始 `mineru_base` 与当前 PBS 序列，用真实表格同页来源重新生成每个候选 `md_block`，再次要求 **267/267 行严格符合这一次 +2 偏移模型**，否则拒绝任何自动恢复（可能已有其他人工编辑）。
2. 严格符合时只提交 211 条差异，逐一带 `before=受损原文`、`after=原始来源重建原文`、稳定 `logicalId`，使用现有 `commit_md` API 的 SQLite `BEGIN IMMEDIATE` / 旧值 CAS 事务，不能绕过为整个表 `DELETE/INSERT`、不能改 `logical_order`、`p,b,s` 或 `mineru_base`。
3. 恢复后重读 267 行与来源逐字相等，原始 archive SHA256 不变、PBS 序列不变、`PRAGMA integrity_check=ok`；提示 iPad Safari 刷新以避免旧页面内存继续显示受损内容。若事务因其他会话改动旧值而冲突，保留事故库，禁止强制覆盖。
