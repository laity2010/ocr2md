# WP29D · AG 公共焦点不重绘

基线 558c41a；根因由 WP04 65fcc2b 引入的 V2 构建适配 focusRow：每次定位均重设 rowClassRules 并调用 grid.redrawRows()。纯选择不需要重读数据或重建单元格。

实际失败证据：原书只读备份到隔离目录（用户已采用全部 11 张图片）。Chromium 与 WebKit 点击 12、17 行，均得到 `{"rowData":true,"rows":false,"images":false,"buttons":true,"columns":true}`（全部 11 张可视图片）。buttons 在该书当前已采用状态无可操作按钮，不冒充实测控件稳定性。首轮夹具等待未采用状态超时；适配原书已采用状态并按 AG v36 的真实 `.ag-row[row-index]` 捕获节点后复现。

最小修正：只修改 V2 构建期 AG port 与焦点 CSS，使用 AG 原生 singleRow selection，无 checkbox、禁止独立点击选择，仍由既有 focusRow 事件决定。只更新旧/新选中状态；重复定位无需重新选择。原有橙色单元格高亮保持，取消默认选中 tint。必要时滚动到目标；过滤隐藏的目标可以保留选择但不强制滚动。数据和页变化仍按原逻辑 setRows。V1、Frame、列布局、数据库不变。历史焦点类选择器同步改为原生 ag-row-selected，结果断言不放宽。

真实书籍隔离副本测试 `V2_TEST_FOCUS_STABILITY=1 V2_TEST_REAL_MEDIA_BOOK=... node tests/v2-owned-edit.browser.test.mjs`，两个浏览器均验证点击 12、17 后 rowData、行 DOM、图片 DOM、列状态保持，CM6 源码行、PDF 选中 ID 正确，正文无改动、零 SQL 写入。PDF 用同页尺寸夹具及真实覆盖框。旧基线可附加 V2_TEST_FOCUS_BASELINE=1 复现。物理 iPad 实机待验收。

通用行视图回归：`V2_TEST_LINE_VIEW=1 node tests/v2-owned-edit.browser.test.mjs` Chromium/WebKit 均 PASS（497 行，原生筛选、精确焦点、切换视图、零 SQL 写入）。最终橙色焦点样式调整后真实媒体 DOM 双浏览器复测仍 PASS。
