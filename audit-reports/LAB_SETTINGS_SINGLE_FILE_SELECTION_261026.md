# OCR2MD V6 Lab · 全局设置菜单与章节定界同时显得被选中（2026-10-26）

## 用户截图与真实状态
- 用户 iPad Safari 截图 `lab-261026-2329` 中，顶栏真实文件为「全局设置/settings.json」，但展开菜单同时把「章节定界」与「全局设置」渲染成类似的绿色高亮，看起来像双选。
- 源码 `/labs/cm-html/modules/source-file-navigation.js` 原先给两份不同 DOM 文件导航 `select` 分配独立值：Settings 面板为 `settings`、隐藏的母文档工作台仍为 `document` 或前一章。Tom Select 的 `.active`（键盘焦点）与 `.selected`（实际选中）原先用近似绿色背景，造成视觉误判。
- 真正点击并复现：Chrome 初始只有 `settings` 为 active+selected；**iPad WebKit** 在 Settings 下拉打开 / Tom 选项镜像重建后，`document` 保留 `.active`，`settings` 才是 `.selected`。这并不是实际多选，但两种背景极相似。早期“强行将 active 对齐 selected”的 requestAnimationFrame 修复在 WebKit 下未能可靠通过，故最终**不对用户键盘焦点做定时器干预**。

## 有界修复
- `3581bea`：`syncOptions` 对所有文件导航镜像统一采用当前激活模块 `isSettings() ? 'settings' : selected()`，消除隐藏源导航的第二份选择。`module-select` 状态改变时主动同步导航，不修改活动章节 ID 或母 Markdown。
- `a9d81e5`：去掉尝试改变 WebKit 内部键盘焦点的非稳态修复。`.selected` 独占绿色背景；`.active:not(.selected)` 为透明背景，键盘焦点只使用点状文字下划线，既避免第二个选中高亮也保留焦点可访问性。
- 不改变 Settings/CMD 保存接口，不触碰 AG、PDF.js、母文档或正式主线。

## 实际操作和截图
- Lab 版本 `v6-lab-cm-html-20261026-235003`，局域网 `https://192.168.1.10:4443/labs/cm-html/`、公网同一 Lab 静态发布；Vite 标准压缩构建 PASS。
- `labs/cm-html/modules/settings-navigation-single-selection.browser.test.mjs` 通过 Chrome + iPad WebKit，真实从章节导航点击「全局设置」→打开设置文件导航→模拟旧章节焦点残留并刷新→重新展开；本机 `module-select`、隐藏的源码导航 select、设置导航 select、Tom proxy **统一选中 `settings`**。真正 `.selected` **仅一项 settings**，旧章节行背景为 `rgba(0,0,0,0)`，settings 选中背景 `rgb(54,80,70)`。iPad WebKit 允许旧章节维持 `.active` 键盘焦点，但不会以绿色背景误认为已选。
- 新截图 `audit-reports/screenshots/settings-navigation-Chrome-before.png`、`settings-navigation-iPad-WebKit-before.png`，以及菜单局部确认图 `settings-nav-single-selected-Chrome.png`、`settings-nav-single-selected-iPad-WebKit.png`，显示只有 settings 行绿色背景。
- `virtual-chapter-navigation.browser.test.mjs` Chrome/WebKit PASS，章节合并/独立章节名称、撤销、元素模式跨章节保持正常、零业务 API 写入。
- 正式主线未合并；本任务不改变 Lab 母数据、不更新 AGENTS.md。WebKit 是自动化 iPad 模拟，不代表已人工操作用户实体 Safari。
