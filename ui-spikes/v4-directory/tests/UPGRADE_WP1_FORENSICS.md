# OCR2MD V4 自动升级故障 WP1/4 · 0816 → 0838

日期：2026-10-14。**不发布新版、不写用户书库、不重启 WCP/4176/Cloudflare。**

## 用户实机事实

- 用户确认外网 iPhone `v4-261014-0816` 可以正常打开。
- 2026-10-14 公网自动升级至 `0838`：版本号自动变为 `0838`，但页面不能正常加载。用户报告失败。
- 回退公网 `0816` 后，用户确认 iPhone 首页恢复正常。
- `devicedebug` 最近 48 小时 iPhone 历史只有其他应用 `math-trace`；**没有 OCR2MD 此次真机的 `pageerror`、请求错误或初始化事件**。不得假称已精确获知真机失败资源。

## 实际排查证据

1. 公网当前稳定版目录 `ui-spikes/v2/v4-directory` 是 `v4-261014-0816`；本机 4176 与 Cloudflare 公网 `build-info.json` 都返回 `0816`。
2. 失败快照保存于 `ui-spikes/v2/.v4-public-failed-v4-261014-0838-60e26e80-be31-42b5-ac09-b1e011182d4b`。逐文件哈希对比：编译后的 7 个 JS/CSS 资产中仅入口 `app.js` 哈希变化，变化全部是 `?build` 版本键；`index.html` 的变化也仅构建标签、时间与缓存键。**业务组件、WCP 容器交互代码和其余部署资产无功能差异**。目录里还有发布脚本/源码文档差异，它们不是网页运行入口。
3. `node ui-spikes/v4-directory/tests/wp1UpgradeForensics.mjs`：使用保留的两套真实运行资产，模拟实体尺寸（390x844）且**不替换 WCP Loader、不替换插件注册表、不替换组件代码**，真实加载 `wcp.laity.bid` WCP；仅禁止访问书库，把同源 Vault API 返回为隔离用 HTTP 401。WebKit 和 Chromium 均验证旧 0816 页面可以自动进入新 0838，结果为 `phase=ready`、AG Grid 挂载、导航 tabs 有值；故正常网络环境下未能复现真机问题。隔离用 401 是预期状态，不意味着真实公网认证异常。
4. `node ui-spikes/v4-directory/tests/wp1LoaderFailureProbe.mjs`：在同样 0838 完整静态页上，**只阻断跨域 `https://wcp.laity.bid/components/v1/loader.js?v=2`**，得到 `HTTP 200`、`0838` 标签已展示、`phase=not_started`、AG Grid 未挂载、空模块窗；这是一种可重复的“版本号对但页面刷不出来”失效机制。
5. 代码证据：`ui-spikes/v4-directory/app.js` 第一行使用远端 WCP 静态 `import`，第二行导入本地注册表，随后才设置 `window.__ocr2mdV4.phase='loading'` 与 `try/catch`。若跨域加载、离线、Safari 模块缓存或依赖模块请求失败，整份 `app.js` 不执行，**页面自有的错误提示、重试和版本切换守卫均无法运行**。

## WP1 判定

- **已确认**：新旧业务发布内容一致；公网失败后的 0816 恢复；应用启动依赖远端静态模块，且缺失针对顶层 import 失败的降级 UI，能够在 WebKit 重现相同类别的故障。
- **未确认**：真实 iPhone 那一次究竟是 `wcp.laity.bid` 加载失败、`ocr2md.laity.bid` 某个 chunk 丢失、Safari 网络/缓存时序还是其他系统级情况。缺少设备侧失败记录，不能把隔离故障注入当成真机证据。
- **WP1 结果**：定位完成（风险机制确证；真实设备故障根因保留不确定性），下一 WP2 必须建立可见的失败阶段、错误边界和完整升级门禁。

## WP2/4 推荐验收口径（不在 WP1 改动生产服务）

1. 把顶层网络 imports 的风险移到可捕获的异步 bootstrap 里，最早用内联少量框架外壳设置 `phase=loading`，出错时显示“应用依赖未加载 / 重试”，不让顶栏版本号被误认为升级成功；重试不得丢书库草稿。
2. 引入仅保留**无用户数据**的本地会话诊断（阶段名、build、错误类型、首个失败资源所属域、navigation timing）；诊断展示于已有版本详情 UI，**不采集密钥、文本内容或书籍信息**。发送至远端诊断须单独授权。
3. 真实 WCP Loader+完整注册表+AG Grid 的旧页→新页测试是发布必选项。静态资源哈希一致性、WCP ready、模块内容可见均须满足。故障注入应覆盖 CDN Loader 阻断、模块 chunk 失败、半发布和 Safari 后台恢复。
4. 公网稳定版保持 `0816`。先发布独立候选入口给物理 iPhone 验证，失败时允许重新打开稳定入口而不自动升级。不要在公网上直接尝试另一次正式覆盖。

## 复跑

```bash
node ui-spikes/v4-directory/tests/wp1UpgradeForensics.mjs
node ui-spikes/v4-directory/tests/wp1LoaderFailureProbe.mjs
```

隔离正向测试元数据：`/tmp/ocr2md-wp1-upgrade-forensics.json`（Mac 本机临时文件；无用户书籍或密钥）。
