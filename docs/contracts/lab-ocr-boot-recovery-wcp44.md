# WCP44 · Lab-OCR 空白启动故障与前端入口分层（实验版）

## 故障现场与已确认范围

- 2026-11-18 iPad Safari 截图：`lab-ocr`、`00000000-0000`、`正在初始化 OCR 审阅工作台`、空的主区域。版本数字是 `ui/lab-ocr/index.html` 的静态占位符，只有应用脚本执行后才会变化；截图不能据此断言真实书籍或 SQLite 已损坏。
- 排查时内外网 `index.html`、当前 entry asset 和发布版本均为 HTTP 200、`Cache-Control: no-store`，本机 Mac Safari 可加载正式版本并转入设置 UI。**没有拿到截图所在物理 iPad 的网络与 JS 控制台，因此不能断言具体哪个资源在那台设备加载失败。**
- 原打包版 `index.html` 有 `modulepreload` 链直指约 1.95 MB 的 `layout-*.js`。`ui/lab-ocr/entry.js` 静态导入 Frame layout，而修改版本占位符的代码位于后续 `frame.js`；入口图某个资源延迟/失败时，页面一直保留原始占位符和状态，缺少可见错误和可操作恢复手段。

## 最小边界修复

- `ui/lab-ocr/entry.js` 现是**轻入口**：先标记当前构建版本和 `正在加载四窗组件`，再动态导入原 `ui/lab-ocr/boot.js`（原业务注册内容原封保留）。构建产物约 2.7 KB 的 entry，不再在入口 HTML 预加载大型 layout 模块。业务、数据、AG、CMD、SQLite、PDF 与媒体逻辑不变。
- `ui/lab-ocr/index.html` 在 module 脚本之外保留独立 classic watchdog，防止首个 ESM 脚本加载失败时自身连错误提示也无法运行：
  - `BOOT_SCRIPT_ERROR`：入口脚本请求失败；
  - `BOOT_ENTRY_TIMEOUT`：18 秒后版本占位符仍未被脚本替换；
  - `BOOT_MODULE_TIMEOUT`：轻入口已运行，但四窗模块等待超过 20 秒；
  - 动态 import 拒绝时显示其短错误信息及已知失败资源文件名。
- **仅在明确模块请求失败后**通过 `?boot-retry=1` 自动重新请求一次，避免无限重载；之后保留可触摸的「重新加载」按钮供手动恢复。若纯粹延迟，只提示与按钮，不抢占慢加载。成功启动清除临时重试标记。
- 失败入口阶段尚未绑定任何书籍/SQLite，也不重写用户设置、文档或媒体；无需额外 Tunnel、独立 CSS 框架或新服务。

## 验收与界限

- `node tests/lab-ocr-bootstrap.browser.test.mjs`：Chromium 和 iPad-WebKit 均验证：拒绝 `boot.js` → 版本先显示 → 错误状态、自动一次重试和手动恢复；拒绝初始 `entry.js` → classic watchdog 报错并恢复；正常 Frame 可加载。
- 原有 Lab Media、注号7的 CM6/SQL 转换、Frame 脚注弹窗与 Frame 基础布局浏览器回归必须通过。
- 发布时校验最终 `dist/index.html` 不再包含大布局模块的初始 `modulepreload`，并比对公网/内网 `release-version.json` 的 SHA。
- 以上是可重现的失败类型及恢复能力验收。**物理 iPad Safari 具体根因与最终现场恢复仍需用户刷新后的现场证据。**
