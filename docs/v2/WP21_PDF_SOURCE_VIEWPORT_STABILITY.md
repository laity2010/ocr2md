# WP21 · PDF 提取文字插入/替换时不让 CM6 源码视窗跳走

## 真实事故复现

- V2 WP20 「提取文本替换」的 `ui/v2-source-session.js` 使用**整个 CM6 文档** `{from:0,to:doc.length,insert:planned.source}`，即使仅一行逻辑块变更；替换文本后 CM6 丢失局部视觉锚点并反复高度测量，读者源码视窗直接跳走。
- `V2_TEST_WP21_ONLY=1 V2_TEST_BROWSER=Chromium node tests/v2-real-markdown-preview.browser.test.mjs` 加载真实 Buffett MinerU 数据（267 `logical_id`，22 页）。源码第 60 行为 `logicalId=69`。旧 WP20 浏览器测得：`before` 可视 `topLine=60,scrollTop=2532`，`after` 可视 `topLine=1,scrollTop=252`，滚动上移 2280px。
- 这不是 PDF.js 文字缺失，也不是 SQLite 原文消失；旧代码执行的是**全篇文本重新提交**，而 SQL 应该只写这一个 `md_block`。阅读位置与焦点位置属于不同的状态，不可用重置光标位置来“修复”滚动。

## 最小改动

1. `ui/v2-source-session.js` 的 PDF 插入/替换路径继续使用唯一 CM6 和 `composeLogicalSource`。先用目标行的 `[from,to)`（包括仅显示不写入 SQL 的 `groupEndPad`）计算 `replacement=planned.source.slice(target.from,target.to)`。提交前核对 `old.slice(0,row.from)+replacement+old.slice(row.to) === planned.source`，否则**拒绝操作**，保护 WP18 前缀完整和子块/虚拟 LF 权属。
2. 只 `editor.dispatch({changes:{from:row.from,to:row.to,insert:replacement}, ...})`，而非变动整篇；同一个 transaction 附 `structureEffect` 和 `blockTextEffect` 维持 267 个 logical IDs/原生 CM6 Undo/Redo/SQL `md-commit`，不是第二个可写 Markdown 或数据库。
3. 使用 CM6 `EditorView.scrollSnapshot()`，根据该**局部 ChangeSet**映射原生滚动锚点；「替换」保留光标在目标逻辑行内的字符偏移，「插入」维持插入后光标。**可视区域稳定的判据是行在屏幕中的位置，而不是删除长行造成 scrollHeight 改变后的绝对滚动数**。
4. V2 `v2-pane-focus.js` → `v2-markdown-preview.js` 透出原 V1 `scroll-sync.js` 的 `sourceEditGesture()` 已有公开端口。PDF 菜单位于 CM6 外部，会使源码框失去 DOM focus；因此在事务前标记 `lastDriver='cm6'`，禁止 Markdown 预览重排后抢夺 scroll leader。原 V1/Frame 的 scroll-sync 代码、用户手动滚动按 WP19 不切换高亮的规则保持原样。

## 实际验收

- 运行 `V2_TEST_WP21_ONLY=1 node tests/v2-real-markdown-preview.browser.test.mjs`。脚本复用真实数据导入与真实浏览器页面，把第 60 行滚动至可视范围，模拟同一业务端口的 PDF 文字替换，测量原生 CM6 滚动值、原生行号在 DOM 中的屏幕位置、光标偏移、来源 logical ID；然后撤销/重做，校验 3 次 SQL 旧值差量提交和 267 行仍在。
- Chromium：`scrollTop` 前后均 `2123`，行 60 屏幕位置约 `94.9px`，可视首行 `52` 不变；iPad-WebKit：`scrollTop` 均 `2831`，行60屏幕位置约 `296.5px`，可视首行 `54` 不变。两者 SQL 3 次、Undo/Redo 和逻辑 ID 检查 PASS。
- 保留 WP20 真实 PDF.js 文本层「提取文本插入/替换」与行号菜单、WP15 表格恢复、WP18 前缀/虚拟换行安全、WP19 仅滚动不改高亮、真实 PDF/Markdown 22 页回归、AG/V1 跨版本门禁。用户真实 iPad Safari 手势仍需现场验证，不冒充 WebKit 自动化验收为实体设备。

**数据安全**：这是纯前端单行文本事务修复；不重建任何 SQLite 表，不修改已有书籍，也不主动插入/替换用户原文。只有用户主动执行行号菜单操作才会按旧值 CAS 增量保存该目标 `md_block`。
