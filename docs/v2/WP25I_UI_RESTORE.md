# WP25I · 既定 UI 契约恢复

## 故障证据
实际发布 d261525（261124-191119）和真实 sample 书籍的隔离 SQLite 副本（267 个逻辑块、445 个 CM6 物理行）在 Chromium/WebKit 均复现：
- 加载时 1 个 gutter、1 个焦点行按钮，标题 View 的实际列序却是通用 MD Line / PBS / 块内偏移 / 源码行号 / Block Type / Line Type / Logical ID / Base ID / 标题层级。WP25F 48217a9 将共享数据误作共享显示布局，未遵循用户指定的正文、Level、Type、其他列。
- 真实键盘输入并按 Enter 后，浏览器 console 报 CodeMirror plugin crashed: Error: Missing real owned LF，行号 gutter 从 1 变 0，按钮从 1 变 0；重开才恢复。WP25D 2fc547a 的 lineMarker -> lineIdAt -> getMdLineIndex 使用新正文及 updateListener 尚未更新的外部 blocks 缓存；CM6 移除崩溃插件。旧测试只检查 pageerror、数据库等，漏掉 console 捕获的插件异常及连续 UI 存活。
- 原 d261525 Git 现场保留。停止其他功能，针对两处已明确的 UI 违约恢复原组件契约；不重做 Frame，不变更用户数据、两表或行级数据架构。

## 恢复范围
- 标题行预设前三列 MD Line、Level（# 至 ######）、Type（行级类型），保留 V1 着色和全局字号，其余字段随后。Level 原生筛选使用同一符号；通用行视图和块视图列布局不变。
- 原 CM6 行号/按钮组件只从当前 view.state 同修订 doc、structureField 获取行索引，点击时解析当前修订行引用；保留原行号按钮样式及删除/提取菜单，取消显式分割的决定不变。
- 修正测试的错误列序断言，捕获 CM6 插件崩溃 console；增加 V2_TEST_UI_RESTORE=1 的真实键盘与行号连续存活验收，可选明确授权书籍只读复制。

## 证据
- 真实 sample 隔离 SQLite 副本：Chromium/WebKit 各 PASS（WP25I_UI_RESTORE_PASS）。标题列序、真实键盘输入/Enter、Undo/Redo、菜单点击、保存重开、267 ID 不变；每次检查可见行号和唯一焦点行按钮，未发生插件崩溃。
- 直接 AG 预设（Level 显示和筛选符号）、MD Line 索引、行编辑、标题识别测试及联邦布局门禁 PASS。
- 未触碰原书或其他 Lab。实际发布身份以 manifest 为准。

- WP25F 标题交互矩阵 Chromium/WebKit 均 PASS：独立标题行、原着色字号、精确点击、7 次 SQLite 差量保存及重开、267 个 ID 不变；未发生 CM6 插件崩溃。
