# V4.3.0 工作目录首页、只读双窗与设置后台预热（2026-10-13）

## Feature Contract

工作目录只负责导航、选择书籍目录及只读文件内容查看。AG 与源码使用 WCP TriPane 0.2.0 的双窗模式（两边均可调整尺寸）；布局模块仍保留默认三窗接口，供后续章节工作台使用。源码 Web Component 精确复用通用设置的 `laity-source-surface` v0.2.5 的模块 URL，不再创建独立的 WorkingEditor、预览副本或编辑提交行为。

首页是工作目录。设置在后台预热 AG 表、共享源码、值预览三者，只有完整 ready 后设置 tag 解锁，且设置组件始终保持连接，不因切换模块销毁其 AG/Grid 状态。设置按钮在工作目录隐藏。后台预热不占据主布局高度，不获取未授权 Vault 文件，不改动 WCP 内核或 v3。

## UIC

| 初始 | 动作 | 预期 UI | 数据副作用 | 不变量 | 测试 |
|---|---|---|---|---|---|
| Safari 初开 | 页面加载 | 工作目录 tag 选中、设置 tag 禁用 | 无 | 用户可先授权 Vault 导航 | Browser Chromium/WebKit |
| 设置资源缓慢 | 等待后台加载 | 设置 AG + 源码 + 值预览完成前按钮不可用，完成才解除禁用 | 仅组件内部暂存 | WCP 不被设置加载阻塞；预热容器不占页面高度 | Browser 人为延迟共享 Manifest |
| 目录已授权 | 点击 AG 文件 | 源码显示只读内容，没有第三窗 | 只读 Vault | 复用 `laity-source-surface`；无编辑动作和写入 | Browser fixture，`0` writes |
| 工作目录布局 | 调节 AG/源码宽度 | 只影响双窗布局与本模块偏好 | 只写布局 sessionStorage | WCP 三窗用户保持旧默认接口 | WCP POC 回归 |
| 设置准备完成 | 点击「设置」 | 已初始化设置 AG、共享源码及值预览出现 | 无业务存储写入 | 预热过的设置 panel 和 AG 实例保持身份 | Browser 双引擎 |
| 设置显示中 | 返回工作目录、再进入设置 | 工作目录重新可导航，设置无需重新初始化 | 无 | 设置 panel 始终 connected，无 Grid destroy | Browser 双引擎 |

## 自动化与真机状态

运行 WCP 仓库 `node tests/workspaceHomePrewarm.mjs`，真实内网页面 + fixture-only Vault，两端 Chromium/WebKit；另运行 `npm run verify`、`node tests/tripaneBrowser.mjs` 与 `node tests/tripaneShadowBrowser.mjs` 验证旧三窗合同。公网 / v3 均未修改；iPad Safari 真机当前待用户自发使用反馈，不因 WebKit 自动模拟宣称已经完成真实触控验收。
