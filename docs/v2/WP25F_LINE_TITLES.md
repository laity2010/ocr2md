# WP25F · 行级标题 View
基线 ab6fa48。真实 LF 的标题预设与 MD Line 共用相同索引行对象，原生 line_type=title 筛选；每标题独立 AG 行，V1 着色和全局字号。块审阅保留持久化 Block Type，不再把含标题的整个块升级为 title；移除堆叠 renderer/CSS。旧未标记库保留历史块级筛选兼容。
直接测试 PASS。V2_TEST_OWNED_TITLES=1 node tests/v2-owned-edit.browser.test.mjs：Chromium/WebKit 各 7 次实际 SQLite 差量提交，独立标题行、同一索引对象、原生筛选、V1 两级颜色和 16px、精确第 8/10 行点击、标题标记删除、撤销重做、267 原始 ID/类型及 PDF 几何、重开均通过。非实机 iPad。未发布。
