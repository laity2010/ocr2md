# WP24 · 全新逻辑表初始化与人工验收发布
基线 47a9dc1。2026-11-24 用户明确决定「不用迁移，直接上线，初始化逻辑表，人工验收」。

## 实施
- 新建数据库及空逻辑表：沿用原基础表到初始 MD Block 编译（包括原跨页表格恢复），仅对全新生成的行补齐真实组内/组末 LF，验证 v3 完整投影并在同一 SQLite 事务写入 user_version=2303。旧非空库普通打开或导入同源不会自动覆盖。
- 现有 SQL 导航组入口：初始化逻辑表（覆盖编辑）→确认初始化逻辑表；明确从当前已授权工作目录的原始 para_blocks 重新生成逻辑层，不迁移旧 MD/PBS 编辑。使用现有 logical-rebuild 入口、新确认值 initialize-v2-owned-logical；不改变原两张物理表和原始文件。旧协议不能重建 v3 库。
- BEGIN IMMEDIATE 写锁内确认源文件摘要，旧非空库先用 SQLite backup API 生成同目录独立隐藏备份 .ocr2md-v2-before-init-*.sqlite（0600），核对完整性和原两表内容并 fsync，再 DELETE/INSERT 逻辑表、验证真实 LF 与基础表一致、提交。异常回滚逻辑层，不用备份文件作为业务表。初始化后重新加载唯一 CM6、AG 及原 PDF 投影，普通刷新不再次重建。
- 真实 LF 模式停用旧单行整理与旧表格修复；未增加第三张应用表，未改 Frame/V1 公共组件。

## 验收
- tests/test_v2_fresh_owned_init.py：全新导入、原子重建、旧编辑备份验证、失败注入回滚、重复初始化确定性、旧协议保护、源基础表不变。
- V2_TEST_FRESH_OWNED_INIT=1 node tests/v2-owned-edit.browser.test.mjs：Chromium/iPad-WebKit exit 0。实际 V2 UI 的 SQL 组两次确认，真实 Python dispatch/隔离 SQLite，267 块，旧手工文字不迁移，真实 LF 生效、原 PDF 坐标相同，重开不再初始化。F02 探测为测试桩；不是实机 iPad。
- 发布使用原 scripts/v2_frame_publish.py，统一 release 槽及原共享跨版本 AG filter 浏览器门禁；后端变更必须重载唯一 Gateway 并实际核对发布 SHA。
- 人工验收：已绑定书籍，在源码窗导航下拉点击 SQL 分组标题，初始化逻辑表（覆盖编辑），确认初始化逻辑表。新书直接绑定即可。不猜测用户实际绑定路径，不从其他目录覆盖用户书籍。旧库备份可供未来明确恢复。
