# OCR2MD V3 → WCP Alpha 独立接入

- 公网 `https://ocr2md.laity.bid/v3-directory/wcp-alpha/`。
- 与 `/v3-directory/` 正式工作台并列，未更改其 `index.html`、打包产物、接口或工作目录数据。
- `index.html` 唯一平台依赖：`https://wcp.laity.bid/components/v1/loader.js`。组件包由 WCP 统一管理 `manifest.json`、不可变版本、哈希校验、兼容升级、自动回退和用户回退。
- OCR2MD 仅提供 appId=`ocr2md-wcp-alpha`、当前项目的 `settings.schema.json`、更新/回退按钮以及独立的设备调试桥。运行时是 WCP 真正的 Shell + 插件生命周期，示例媒体/服务状态并**不操作真实 OCR2MD 文件**。
- `node ui-spikes/v3-directory/scripts/publishWcpAlpha.mjs` 仅同步 `index.html`, `settings.schema.json`, `debug-bridge.js` 到已部署 `/v3-directory/wcp-alpha/`。WCP 新版本发布时**完全不需要**再运行该命令。
- `npm run test:loader` (WCP repo) 的 Chromium/WebKit 检验了 0.1.1→0.1.2 热更新、回退、故障完整性回退与脏状态保护。
- WCP Alpha 页当前正式**未迁移** OCR2MD 章节/媒体真实业务；下一步进行单个业务模块迁入时必须执行 V3 功能/UIC 协议及完整人审。
- 真实 iPad Safari 仍须在本新入口测试并以 `devicedebug` `app_id=ocr2md-wcp-alpha`, `automated=false` 的新鲜数据确认；不能用既有 `app_id=wcp` 真机验收代替。

## WCP CQE 与模块自治验收（2026-10-12）

- 直接打开同一个 Alpha 公网地址即可看见 `章节媒体`、`变更审计` 等 OCR2MD 自有模块。WCP v0.1.3 仅提供通用模块注册和 CQE 总线。
- `modules/contracts.js` 是独立版本化消息契约；`modules/document.js` 是唯一文档状态所有者；`modules/media.js` 自有源码扫描、UI、任务状态并通过 CQE 请求文档服务；`modules/review.js` 独立订阅事件。每个模块均不 import 其他模块实现。
- 媒体识别通过 `media-scan-entry.ts` 引入真正的 `scanChapterElements`，`publishWcpAlpha.mjs` 发布时自动重新构建浏览器版 scanner（不是手写模拟识别）。
- Alpha 按钮只在虚拟内存章节中执行引用替换，不联网下载，也不读取/写入正式 Vault、DIRjson 或章节 MD。
- 媒体 v1.0.0→v1.0.1→v1.0.2 的修改均仅发生在 `modules/media.js`；中央 WCP 内核及 `document.js`、`contracts.js`、`review.js` 的 SHA-256 不变，证明其余模块不需跟改。v1.0.2 为每次 WCP 激活维护独立 task/UI state，避免热更新后旧组件卸载污染新实例。
- 执行 `node ui-spikes/v3-directory/scripts/checkWcpAlphaBoundary.mjs` 验证无业务同级模块直接依赖；`node tests/ocrMediaBusBrowser.mjs` 在 WCP 目录通过公网跑 Chromium 和 WebKit CQE 端到端测试。
