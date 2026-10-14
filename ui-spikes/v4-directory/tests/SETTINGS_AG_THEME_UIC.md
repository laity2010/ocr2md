# OCR2MD V4 · 设置模块 AG 深色隔离 · UIC SETTINGS-AG-01

**日期**：2026-10-14。仅修改 OCR2MD 的 `ocr2md:settings` 模块。

## Feature Contract

**操作**：用户从「工作目录」切到「设置」，再切回工作目录、再回到设置。**需要**：设置模块继续复用独立发布的 Laity Shared Settings (0.1.17)、自己的 AG Grid、源码组件和 WCP TriPane/ResidentHost；工作目录为 iOS AG 行可见而加载 AG Community 结构 CSS。**效果**：设置 AG 始终深色，按原业务显示组件模块/功能组/启用/参数名及 5 项设置，源码窗保留高亮，设置状态与用户改动不丢失。

**样式边界**：公共 AG 结构样式会覆盖该组件原 AG 主题为 `#fff / #000 / Helvetica Neue`。只在 OCR2MD `plugins/settings/settings.js` 模块的 `SETTINGS_TRI_CSS` 中指定 `#settings-shared[data-wcp-layout="tripane"] .las-grid-col :is(.ag-styled-root,.ag-root-wrapper)` 的 AG 色板/Sarasa 字体变量；不修改 WCP 核心、Shared Settings 发布产物、Dockview、章节定界专属配色、工作目录旧样式，或业务数据。

**副作用/不变量**：不写 Vault，不读取真实书籍，不更改设置值、schema、草稿历史或存储键，不触发持久化；iPad 界面不新增无关控制。工作目录和章节定界仍各自维护自己的 AG 实例。

## UI Interaction Contract

| UIC | 初始 | 操作 | 预期 | 数据副作用 | 等级 |
|---|---|---|---|---|---|
| SETTINGS-AG-01 | OCR2MD v4 候选、工作目录 AG CSS 已加载，设置组件 5 项 | 激活设置 | AG `#1d2732` 深色、表头 `#253343`、正文 `#dbe5f0`、Sarasa，源码窗仍可用，5 行均在 | 无写入 | 自动 WebKit/Chromium |
| SETTINGS-AG-02 | 设置 AG 已深色 | 设置 → 工作目录 → 设置 | 同一深色 AG、行数、编辑状态保留 | 无写入 | 自动 WebKit/Chromium |
| SETTINGS-AG-03 | 章节定界以自己的主题深色显示 | 在工作目录、设置间切换 | 章节模块仍采用自己的 `#2f383e`、OCR 标题红色及原勾选列，互不污染 | 无写入 | 自动章节 AG CSS 反向顺序回归 + iPad |
| SETTINGS-AG-04 | 实体 iPad 使用可信 4443 HTTPS 候选 | 打开设置再切回章节定界 | 两个 AG 均深色，各自外观正确 | 无写入 | manual-external |

自动化命令 `node ui-spikes/v4-directory/tests/settingsAgThemeIsolationBrowser.mjs`：在 WCP 真实网页环境仅拦截设置模块脚本，确保回归测试加载待发布的 CSS，不涉及其他项目、用户凭据。构建发布只允许设置 CSS 文本变化（其余仅自动 stamped 的 html/app/build-info），不自动晋升正式版。

**来自用户的实机证据**：`1905` 局域网 iPad「章节定界」深色通过，「设置」AG 白底，源码仍深色；章节状态出现 `IR HTTP 400`，这是独立保存失败问题，不属于主题修复，不得由 CSS 更新声称解决。

**人工状态**：设置 AG 深色修复需 iPad 真机再次确认；章节保存错误另外追踪。

## 发布与自动回归结果 · 2026-10-14

- 从候选 `v4-261014-1905` 构建 `v4-261014-1932`，运行时差异仅 `plugins/settings/settings.js` 中的 CSS（外加 `app.js`、`index.html`、`build-info.json` 自动构建标识），严格门禁 `--upgrade --settings-theme-fix` 已核对代码差异及全部其他文件未改变。
- 真正 WebKit + Chromium 均完成设置信息 5 行、深色 `rgb(29,39,50)`、Sarasa、源码就绪，以及「设置 → 工作目录 → 设置」恢复测试 `SETTINGS_AG_THEME_ISOLATION_PASS`。该专项测试使用 WCP 项目内正式发布的 **同一组件文件字节**替代网络偶发失败，不模拟 WCP 行为，不连接真实书库。
- 原有 WP2 自动升级/容错/混合资源门禁 6/6 PASS；WP3 两浏览器 5 行布局、深色与 empty pinned spacer 注入回归 PASS。
- 新候选 `v4-261014-1932` 公网、Mac 4176 与局域网 HTTPS 4443 均已验证；正式版仍 `v4-261014-0816`。旧候选 `1905` 全量回退保留。
- **待用户真实 iPad 审核**：设置标签 AG 转深色、与章节定界的两种独立深色样式共存、切换后保留当前操作现场。
- 截图另有章节标定保存 `IR HTTP 400` 提示，仍是独立未解决问题；当前 CSS 修复无业务持久化改动。
