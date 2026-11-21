# V2 · PBS 三列直接升级与两层规则

本轮用户确认 V2 尚无人工编辑，批准直接升级 PBS，而不另设独立数据安全航点。本次采用旧五/六列表的原地事务迁移，保留原有逻辑行及原始 MinerU，不靠删除重转实现。

## 规则与实现

- 唯一两张应用物理表：`mineru_base` 18 列；`logical_block` 旧六列 + `p`、`b`、`s` 三个整数，共九列。唯一 PBS，初始只有 `para_blocks` 正文逻辑块，每基础块一个 `s0`。`pNbM` 为父块分组，不另设父块物理行；最多两层，禁止孙块。
- 22 页真实样本：539 个原始块、224 个逻辑块，初始化 `p0b0s0` … `p21b20s0`，PBS 可留空号，不因局部移动重编其他行。原始物理 PDF bbox 始终来自 `mineru_base`。
- `scripts/v2_pbs.py` 负责首次分配 PBS、原位迁移时把旧已知两层关系转换为 `s0/s1`，拒绝孙块；后续编辑不许再次调用初始化函数重排。`scripts/v2_pdf_projection.py` 直接读 `p,b,s` 并从当前分组 `s0` 找父块；原 V1 多轨 PDF 组件本身不改。
- 旧五/六列 SQLite：由用户原有 Frame F02 目录授权及原始文件 SHA 验证，`BEGIN IMMEDIATE` + `ALTER TABLE` + 回填整数 PBS + 唯一索引 + 校验后 `COMMIT`；事务中任何错误自动回滚，原有逻辑文本、类型、ID 不改。未知非空不兼容结构不会自动重建覆盖。
- AG 在逻辑表以派生 PBS 为固定首列，同时显示所有九个真实 SQL 字段。Markdown 外部块位置清单带 `p,b,s`；原始基础块和 PDF 坐标不修改。

## 仍未实施

PDF 拖动归入/拆分、CM6 对 SQLite 的增量写回、PBS 冲突的编辑事务及对应 Undo/Redo 仍未开放；PDF 当前只读。下一航点需要基于九列表对局部更新执行原子事务，不增加孙块、第三张 SQL 表或操作历史表。

## 验收及回退

- 源码回退标签：`v2/wp05-pbs-baseline-20261121`（旧六列）。注意 **Git 回退不能自动将已经升级的用户 SQLite 降级**；回退数据需要另外备份/恢复，不可用旧程序自行重转。
- 测试：`tests/test_v2_pbs_upgrade.py`、`tests/test_v2_mineru_base.py`、`tests/test_v2_pdf_projection.py`、`tests/v2-mineru-base.browser.test.mjs`、`tests/v2-real-markdown-preview.browser.test.mjs`。Chromium/iPad-WebKit 自动化不等于用户 iPad Safari 实机验收。
