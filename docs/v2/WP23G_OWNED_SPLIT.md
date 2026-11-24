# WP23G · 显式分割逻辑块（隔离验收）
基线 8786932。沿用 README §3.1 真实空行、两表、唯一 CM6、稳定逻辑身份及不伪造 PDF 来源的契约。

## 分割语义和公开接线
- `splitOwnedBlock(rows,{logicalId,offset,newId})` 为纯逻辑规划；`v2SourcePort.splitAtLine(lineNo,expectedId)` 为实际 CM6 入口；复用已有行号菜单，仅在当前确有归属的真实空行显示「在此分割逻辑块」。普通键入/换行不产生身份；EOF 虚空行不能用作分割点。
- 分割点 LF 属于左块。原块保留 logicalId；右侧文本进入新独立父块。若原组在分割块后有子块，随新组重新归属，仍只有两层；分割位置之后同页 b 必要顺延，其他页 PBS 不变。两个组末不足的真实 LF 同事务补齐；中间已足够的空行不删，不吞正文。真实块末分割可创建空的新逻辑块。
- 人工 ID 使用 2^48 至 2^49−1 的安全整数区间，随机分配并检查已有身份冲突；SQL 在原子提交时再次校验。新块继承 baseBlockId 作为原始来源关联，raw_path=NULL；没有独立原始证据，不伪造 bbox。原始块源路径与覆盖框均不变。AG 实时新增/移除同一逻辑行；聚焦人工新块不绘制/冒用原始 PDF 框。
- 原生 CM6 StateEffect/invertedEffects 同时记录分割结构和正文，即使正文完全不变也能 Undo/Redo；不增加平行编辑历史。重做使用同一新 logicalId。
- 既有 structure-commit 入口追加 commit-v2-owned-inventory 协议，仅用于逻辑行库存新增/撤销新增。BEGIN IMMEDIATE 内校验完整旧结构与逐块正文 SHA256，受影响行差量写入、PBS 临时避让、原始来源不许改写、仅允许删除人工新增块，最终验证 v3 真实 LF、两层 PBS、FK。错误整批回滚。客户端保留原 CM6 状态，成功回执后更新正文和结构确认快照。旧协议和旧库保持保护。
- 所有更改仍限隔离的已标记数据库。未提供正式迁移入口，不改用户库，未发布。

## 实测
- node tests/v2-owned-split.test.mjs PASS：父组中间分割、子块分割、组末新空块、原文精确拼接、非法非空行拒绝；其他页 PBS 保留。
- python3 tests/test_v2_owned_split.py -v PASS：267 块真实 MinerU 隔离 SQLite，新增至 268，完整正文 SHA 相同；文本摘要冲突、非法末尾 LF 整批回滚；原块禁止删除；新块无 raw_path/raw_block/bbox，原 267 个 PDF 坐标不变；撤销及重做新身份一致。
- V2_TEST_OWNED_SPLIT=1 node tests/v2-owned-edit.browser.test.mjs PASS，最终退出 0。Chromium 和 iPad-WebKit 实际 V2 工作台中点击第 2 行行号及分割菜单，267→268→267→268；每浏览器 3 次实际 SQLite 原子提交及重新加载。分割前后源码字节不变，AG 新行 p0b1s0/source_line=3，人工块无原始覆盖框、PDF 不冒用选中框。F02 探测为测试桩，真实 Python dispatch，临时 SQLite，V1 PDF.js 合成 PDF 与原样本页尺寸；不是实机 iPad 验收。
- python3 tests/test_v2_owned_structure.py -q、python3 tests/test_v2_owned_edit.py -q、python3 tests/test_v2_structure_commit.py -q、node tests/v2-structure-move.test.mjs PASS。
- python3 ../../.ops/verify-unified-layout.py PASS：7 Lab、8 独立州 AGENTS、联邦契约与共享发布文件哈希保持合法。
- 未验收 WP23H 多行标题分类和精确位置，不宣称已上线。生产迁移仍需独立授权、安全验证。
