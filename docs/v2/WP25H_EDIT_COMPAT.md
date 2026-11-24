# WP25H · 历史库存编辑兼容纠偏
恢复点 e0c3c16。用户实机反馈源码无法编辑。实际授权目录的 sample 数据库 v3、268 个逻辑块、1 个旧人工 ID；三份同步副本元数据相同。未对用户原库写入。原发布资产（e0c3c16）对正常 267 块测试书籍的真实点击、键盘、Enter、Unicode、保存重开通过，但对当前书籍的只读 SQLite 隔离副本，Chromium/WebKit 均实际键盘被拒绝。根因是 WP25B 错把退休库存创建/删除规则扩展到所有已有块的编辑。
纠偏：保留所有已存在的 logical_id、PBS、正文、原始几何；撤销整个文档只读及后端全库拒绝写回的门禁。旧 commit-v2-owned-inventory 仍 409；正常事务仅 UPDATE 既有 ID，保留 CAS、真实 LF、原子回滚及前端完整库存集合核验。历史人工块不得产生假 PDF bbox；不自动初始化、合并或迁移。
验收：
- Python tests/test_v2_owned_split.py：历史库存普通块/人工块均可编辑，旧增删请求及未知 ID/旧值 CAS 拒绝，基础证据、稳定库存、PDF 几何不变。
- V2_TEST_LEGACY_EDIT=1（可选 V2_TEST_COPY_FROM 指向明确授权书籍 SQLite，源以 mode=ro 备份到独立临时目录，默认可复现的合成历史库存夹具）tests/v2-owned-edit.browser.test.mjs。原 e0c3c16 使用 V2_TEST_BLOCKED_RELEASE=1 实际旧资产复现。修复版对用户实际书籍隔离副本 Chromium/WebKit 各通过原始块及历史块真实键盘输入、4 次实际 SQLite 差量提交、Undo/Redo、重开，268 个 ID、267 个原 PDF 覆盖框、非目标块不变；PDF 为合成渲染夹具；公共行定位 API 仅设置真实光标及焦点，文本修改经原生浏览器键盘输入而非直接 dispatch。Chromium 另一次实测真实 DOM 点击也通过；WebKit 虚拟化测试标记不稳定，最终使用公共行定位。未进行用户 iPad 实机操作。
- WP25A/C 直接测试、原正文/归组 Python 回归及联邦布局门禁 PASS。
- README 将已存在人工 ID 正常编辑及实际存量书籍键盘验收设为当前约定。其他 View 不改。
