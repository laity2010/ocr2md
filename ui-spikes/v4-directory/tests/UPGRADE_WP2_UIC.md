# OCR2MD V4 WP2/4 · 启动错误边界及完整升级门禁

2026-10-14。正式公网 `v4-261014-0816` 为冻结稳定版本；候选 `v4-261014-0916` 仅构建于源目录 `ui-spikes/v4-directory`，不得将源码/隔离 WebKit 通过当成真实 iPhone 上线成功。

## Feature Contract

**功能**：平台级、业务无关的启动错误边界（Shell）及原子发布前的真实启动验收。模块依旧只实现自身业务，与页面恢复流程无直接耦合。

- **操作**：浏览器获取 `index.html`。**需要**：独立于插件/WCP 的启动 Shell 先创建 `loading` 状态，异步加载应用入口 JS，捕获 import 错误。**效果**：即使跨域 Loader 或插件注册表不可用，仍显示当前版本、失败状态、可见重试，而非空白业务界面。
- **操作**：模块成功初始化。**需要**：WCP `mountWcp()` 返回符合选择模块契约的实例，并已经在模块容器添加内容，顶栏导航可用。**效果**：状态标记 `ready`，错误提示消失。**不变量**：HTTP 200 或版本标牌不属于启动成功的证据；浏览器完整升级门禁额外验证可见 ARIA grid 及真实插件导航。
- **操作**：用户点击「重新加载应用」。**需要**：确认全局框架状态不为 `dirty`、模块没有 `[data-unsaved]` 标记且不存在正在聚焦的可编辑控件。**效果**：存在草稿时阻止导航；否则带 recovery URL 重试，不能清除草稿和本地文件。
- **操作**：查看既有版本弹窗。**需要**：仅当前构建 ID、启动阶段、错误类别及已知公共资源域名。**效果**：本地屏幕可审查失败阶段。**隐私**：绝不上传诊断事件；不读取文档、目录、授权 Header、token、请求 query、正文或用户输入；无需新持久化日志。
- **操作**：发起公网发布。**需要**：静态 SHA 与版本契约、独立 staging、真实 WCP Loader + 真实插件注册表旧→新升级验收、未保存状态阻拦、半发布拦截、启动失败恢复均通过。**效果**：任何一项失败则拒绝 `release-public.mjs` 的正式切换。

## UI Interaction Contract (UIC)

| UIC | 初始状态与操作 | 预期界面 | 数据副作用 / 不变量 | 自动化等级 |
|---|---|---|---|---|
| WP2-01 | 正常加载候选 | 版本弹窗显示启动阶段，WCP 工作目录 AG 表、导航可见 | 不写真实书库；`phase=ready`，不能只凭版本号 | WebKit+Chromium `wp2UpgradeGate.mjs` |
| WP2-02 | 阻断 `wcp.laity.bid` Loader | 顶部已有版本号但显示启动失败、错误代码与重试入口 | 不发生不受控刷新；Shell 自身不依赖 WCP | WebKit+Chromium `wp2UpgradeGate.mjs` |
| WP2-03 | 对失败界面标记未保存后点击重试 | 原页面停留，状态提示存在未保存内容 | 不刷新、不清草稿；随后解锁并恢复网络则可重试成功 | WebKit+Chromium `wp2UpgradeGate.mjs` |
| WP2-04 | 阻断插件注册表 | 同 WP2-02 | 顶层 import 失败可捕获，不把加载失败误判 ready | WebKit `wp2UpgradeGate.mjs` |
| WP2-05 | 新清单已到但 HTML 仍旧 | 顶部显示等待资源同步，仍停在旧版 | 不启动不完整版本 | WebKit `wp2UpgradeGate.mjs` |
| WP2-06 | 旧版运行中、状态为 dirty，服务器切换候选；清除 dirty | 先等待保存，之后升级；新版本实际显示 AG grid、导航可用 | 用户书库 API 在浏览器自动化被隔离为 401；不写用户书籍 | WebKit+Chromium `wp2UpgradeGate.mjs` |
| WP2-07 | 将同一发布候选复制到独立临时静态目录 | Chromium/WebKit 顶栏版本、弹窗、不同屏宽一致 | 验证所有清单列举文件 SHA；不替换公网目录 | `buildVersionBrowser.mjs` |
| WP2-08 | 实体 iPhone 由 0816 升级候选 | 页面完整显示，故障时在版本弹窗看到阶段与错误 | 不自动切换正式公网入口 | `manual-external`，列入 WP3 |

## 实施与部署约束

- 入口改为 `index.html` 自带无依赖 Bootstrap；**不用独立后台代理、SSE、轮询守护服务**。`app.js` 仍作为 WCP 组件组装入口。
- 诊断仅在当前页面内存，不向后台发送；状态显示在原有框架状态栏及版本弹窗。一个错误提示区、一个重试按钮。
- `scripts/release-public.mjs` staging 构建完成后强制执行 `wp2UpgradeGate.mjs`，通过才能双 rename 切换。旧 4176 后端仍有独立的不兼容门禁，不得绕过。
- `scripts/build-test-push-ipad.mjs` 从源码构建、在临时目录执行浏览器测试、执行完整升级门禁、再调用 `release-lan.mjs`；**不再调用会覆盖公网静态目录的 `publish.mjs`**。4292 若后端过旧仍拒绝替换。不能把候选源码号当作线上版本。
- 不修改 V3、WCP 内核、实际 Vault、Cloudflare 配置；不重启公共服务、不推送公网、不修改用户书籍。

## 命令

```sh
node ui-spikes/v4-directory/scripts/build-modules.mjs
node ui-spikes/v4-directory/tests/wp2UpgradeGate.mjs
# browser version/hash test MUST use a dedicated v4-directory staging root:
V4_TEST_STATIC_ROOT=/tmp/<staging-root> node ui-spikes/v4-directory/tests/buildVersionBrowser.mjs
```

## 验收状态

- 自动化功能测试：**通过**。`wp2UpgradeGate.mjs` 最终 6/6：WebKit 完整升级、WCP Loader 失败恢复、插件注册表失败恢复、半发布保持旧版；Chromium 完整升级与 Loader 失败恢复。检查基于标准 `[role=grid],[role=treegrid]`，不依赖 AG Grid 私有 DOM class。`buildVersionBrowser.mjs` Chromium/WebKit 1024/768 共 4/4，通过 8 项 manifest 静态资源哈希与启动状态、版本弹窗等验收。
- 实体 Safari：未发布、未验收。下一步 WP3 仅在独立公网候选入口实机测试。
