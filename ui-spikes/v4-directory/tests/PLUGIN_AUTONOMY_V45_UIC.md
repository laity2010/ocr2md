# OCR2MD V4.5.0 — WCP 插件自治收口验收（2026-10-13）

## 功能契约

- 开发主场景：局域网 `192.168.1.10:4292/v4-directory/`；仅当 iPad 在外网时才将通过门禁的版本发布到**独立公网开发候选路径**，稳定公网 `v4-directory/` 需用户明确要求才覆盖。
- 每项 OCR2MD 业务有独立 `plugins/<id>/`，其 `plugin.json` 声明 `id/entry/kind/tab/order/home/prewarm/actions/enabled` 与可选 `bundles`；添加插件只需修改该插件目录和重新执行既有通用构建命令。
- `scripts/build-registry.mjs` 扫描启用的插件并生成唯一注册表。`app.js` 不 import 任意具体 OCR2MD 模块，不列明具体导航标签和业务消息合约；WCP 按泛型 CQE 声明路由 Query/Command/Event。
- `WCP ResidentHost 1.0.0` 是单独发布并做 SHA-256 校验的小型公共组件，管理离屏但仍连接 document 的重型 UI 实例。设置与工作目录共用此能力；离开/返回标签不重建 AG、CodeMirror 或重复获取目录。
- 插件禁止跨插件 import、越权 import Shell 内部文件。`check-plugin-boundaries.mjs` 在构建时阻断，且有独立反例测试。暂时明确许可的 v2 通用 AG/Grid 核心与 v3 无 UI 目录控制器为过渡依赖，后续可逐步替换，不能泛化为全部跨项目 import 放行。静态检查只是工程门禁，并非恶意脚本的安全沙箱。
- 第一个独立接入样板为媒体：`plugins/media` 的 `enabled:false`（生产默认不安装）；隔离 fixture 将其改成 true 后，自动出现「媒体」导航，并由 `ocr2md:media` 通过 CQE `media.scan` 查询 `ocr2md:media-scan` 服务，识别图片、HTML 表格、块级 LaTeX。**这不是正式媒体下载/清洗模块，尚不接 Vault。**

## UIC

| 初始 | 动作 | 预期 UI | 数据副作用 | 不变量 | 自动验收 |
|---|---|---|---|---|---|
| 默认插件清单 | 启动内网 v4.5 | 工作目录首页、后台预热设置；媒体 tab 不出现 | Vault 只读 | WCP 核心与稳定公网不改 | `workspaceKeepAlive.mjs` |
| 工作目录已选中子目录 | 设置↔工作目录切换 | 保留原 DOM、Source、子目录与已选文件 | 目录 LIST/授权 status 请求不增加 | `ResidentHost` 始终连接，业务实例不被销毁 | Chromium/WebKit |
| 设置已就绪 | 切换、拖 TriPane、修改参数、撤销/重做/保存 | AG、源码、预览联动且状态保留 | 仅 UI 配置本地存储 | 文件系统无写入 | `settingsTriPaneMigration.mjs` |
| 新增媒体插件 | 仅启用 `plugins/media/plugin.json`，构建注册表 | 自动出现媒体 tab，检测 Markdown 3 种媒体 | 只在 fixture 内存流转文本 | app.js/WCP core/其他模块哈希均不改变 | `mediaAutodiscoveryBrowser.mjs` 双引擎 |
| 插件故意跨界 | 使媒体 import 工作目录或文件服务的内部文件 | 构建门禁失败，不发布 | 无 | `ROUTE` CQE 是模块间合法通道 | `plugin-boundaries.test.mjs` 四项 |
| 脚本增减插件 | 更新其本地 `bundles`/manifest | 通用生成与打包无需改代码 | 构建产物 | 公共脚本无业务名硬编码 | `build-modules.mjs`、静态检查 |

## 真实设备与限制

Playwright 在 LAN 页面测试 Chromium 与 WebKit（包括 iPad 尺寸模拟），不能替代实体 iPad Safari 手指拖动实测。历史 V2 AG 包、无 UI V3 DirectoryController 仍是暂时的显式共享依赖。设置共享组件会在离开 DOM 时销毁 AG，因此使用 WCP ResidentHost 的保留连接机制，并非 WCP Runtime 自动替业务管理所有状态。
