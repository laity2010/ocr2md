# WP25E · 通用 AG 行视图
基线 2fc547a。同一个 AG Grid 的 MD Line 预设直接消费当前 CM6 getMdLineIndex().rows，保持原块审阅、页范围和全部、V1 EnumCheckboxFilter、独立的视图过滤状态。当前行对象身份验证拒绝陈旧定位；同块跨行焦点通过原事件传递 sourceLine，不重复 PDF 聚焦，Markdown 按实际渲染行范围高亮。无新 SQL 查询、独立正文或实体表。
V2_TEST_LINE_VIEW=1 node tests/v2-owned-edit.browser.test.mjs：Chromium/WebKit 双 PASS，真实 497 行、267 块，索引对象身份、原生多值筛选、页范围、真实 AG 点击、CM6 同块换行、PDF 选中 ID、滚动不抢光标、切回原列及无写入均通过；PDF 为合成夹具，非实机 iPad。直接回归通过。标题仍为旧预设，WP25F 独立替换。未发布。
