# WP29B · 已下载但未采用的媒体预览

基线：4d81b21。实机截图显示 AG 中有已下载的远端引用缩略图，但 Markdown 预览仍请求原远端链接而显示破图。修正：V2 预览仅对允许的 MinerU HTTPS 图片 URL 查询原书授权 media-status，complete 时使用同一 media-file 路径；缺失或失败保持远端；媒体状态更新触发预览查询，异步结果按工作目录和现存 URL 核验。没有自动下载、正文替换、SQL schema、AG 列布局或公共组件变更。

验收记录：首次完整工作台测试在等待短暂 dirty 状态时超时（退出 1，原测试第 187 行），此时未采用图片的本地显示断言已通过。后续改用实际正文精确匹配及保存次数验证，而非仅捕获瞬态 dirty；保留原有保存、撤销、重做、重开、标题列序断言。

- `V2_TEST_MEDIA_VIEW=1 node tests/v2-owned-edit.browser.test.mjs`：Chromium + WebKit PASS（退出 0）。阻断 CDN，未采用的两处远端引用可显示本地图片、原文不变且零写入；采用后一次 CAS 保存、撤销重做及重开通过。
- `node tests/v2-media-direct.browser.test.mjs`：Chromium + WebKit PASS。
- `python3 tests/test_v2_media.py`：PASS。

测试为隔离夹具；未写用户数据库，实际 iPad Safari 仍待用户验收。
