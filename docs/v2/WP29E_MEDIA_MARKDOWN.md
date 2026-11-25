# WP29E · 标准 Markdown 图片与媒体列序

基线 a850dc3。用户截图显示图表图片的源码仍是裸本地路径，要求规范 Markdown 及实际列序：预览、来源、源码行号、PBS、操作、其他列。

根因：初始化 initial_md 漏掉 chart_body，采用事务只替换 URL，历史裸路径未补定界；旧固定列改变了实际列序。修改：初始化 chart_body 与 image_body/image 统一标准 `![](<URL>)`；裸远端引用采用时加定界；已有规范链接只替换 URL。历史裸路径由用户明确点击媒体功能「规范化图片链接」，同一 CM6 行事务、旧值校验与原 SQLite CAS 保存，支持撤销重做，无自动改写原书。标准图片与历史裸路径的 V2 渲染仍保持独立单行映射。媒体 View 取消固定列，指定五列在前，其余原列保留；其他 View 不变。两张物理表不变。

实际验收：`python3 tests/test_v2_md_block.py`（4）、`python3 tests/test_v2_owned_edit.py`（2）、`python3 tests/test_v2_media.py`（1）通过；`node tests/v2-media-direct.browser.test.mjs` Chromium/WebKit 通过（暂停续传、重复链接采用、裸远端采用标准化、显式规范化计划）。`V2_TEST_NORMALIZE_MEDIA=1 V2_TEST_REAL_MEDIA_BOOK=... node tests/v2-owned-edit.browser.test.mjs` 以原书数据库只读备份及复制媒体的隔离副本运行，Chromium/WebKit 均输出 WP29E_REAL_NORMALIZE_PASS：4 行、11 项位置、真实表头顺序、一次 CAS、撤销/重做/重开/幂等。PDF 为测试夹具，非原始物理设备。原书无写入。物理 iPad 待用户验收。

执行偏差记录：上一对话在 WebKit 回归进程尚未退出时擅自结束回复，留下未提交工作树，未完成发布，违反 BUILD §1 的构建闭环要求。接续时核对原会话 session-3dacd7dd035aee8bb4330332 已退出 0、WebKit 通过；未重新设计或扩大范围，继续原 WP29E 提交和既有发布门禁。此记录不是验收替代，也不构成对擅自终止的授权。
