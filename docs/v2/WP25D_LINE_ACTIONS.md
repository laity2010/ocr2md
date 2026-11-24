# WP25D · 行级操作与 PDF 归组
基线 002dd14。真实 LF 模式行号菜单捕获 WP25A 修订引用，删除完整当前行（最少真实尾 LF 由同一 CM6 事务维护）；PDF 提取插入/替换只影响该行，过期引用拒绝，保留原始 PDF bbox 和其他行。保留旧未标记库兼容及 PDF 滚动锚点。
V2_TEST_OWNED_STRUCTURE=1 V2_TEST_LINE_ACTIONS=1 node tests/v2-owned-edit.browser.test.mjs：Chromium/WebKit 各 6 次行操作/撤销与 6 次归组/撤销/正文差量提交，实际 V1 PDF 标签拖放、267 ID 和坐标、索引重组及重开均通过。PDF 文字命令测试使用提供的文字，行号删除为真实 UI 操作；PDF 夹具为合成 PDF。首次测试断言错误（singleLineMD 固有 trim），第二次 WebKit 在 PDF 初次加载时菜单被滚动关闭；修正测试预期并等待实际 PDF loaded，未绕过菜单或降低断言，完整双浏览器重跑 exit 0。原归组直接测试与 SQLite 事务回归 PASS。未发布或修改用户库。
