# WP25B · 退役显式分割
基线 960e6ad。移除行号菜单分割项、CM6 splitAtLine、人工 ID 生成及库存 SQL 写入实现；旧 commit-v2-owned-inventory 一律 409。保留只读人工 ID 识别和原始 PDF 坐标映射；存在旧人工 ID 时拒绝正文/归组事务，保留原库，状态栏提示明确初始化。普通逻辑块编辑和归组不变。
直接测试 tests/v2-owned-split.test.mjs、tests/test_v2_owned_split.py PASS：旧请求拒绝且原内容/坐标不变，隔离历史人工块可读、写入拒绝。V2_TEST_OWNED_SPLIT=1 node tests/v2-owned-edit.browser.test.mjs：真实工作台 Chromium/WebKit 的行号菜单不再有分割项，公开 API 消失，267 块/原坐标不变、0 写入。原正文、归组、初始化和公共索引回归 PASS。历史 WP23G 实现保留于 Git，不是当前执行契约。未发布或写用户库。

> WP25H 纠偏：上述整本只读门禁已被实机反馈及真实书籍副本复现证明有误；以 README 第 3.1 节及 WP25H 为准。已有人工 ID 可编辑，库存增删仍禁止。
