> **2026-10-14 WP0 故障恢复候选 `v4-261014-2144`**：首次布局挂载失败未清理 resident/工具栏，重试后产生重复 ID，数据会加载到屏幕外的旧视图，出现“状态成功但三窗空白”；先开空工作台再选书还会因导航刷新顺序错误而保留空导航。现仅修 `plugins/chapter-boundary/boundary.js`，故障字节红灯、修复字节双引擎真实文档回归通过。原诊断候选发布门禁、顶栏四组、升级六项和目录双引擎门禁通过；实际 HTTPS 入口的勾选、撤销重做与 AG/源码/PDF 联动通过，书库零写入。正式版仍 `0816`，`2057` 全量回退快照保留。用户 iPad 首次异常栈未捕获，人工审核待确认。证据与边界见 `tests/BOUNDARY_MOUNT_RECOVERY_WP0_UIC.md`。没有启动 WP1 或扩大重构。

> **2026-10-14 候选 2015**：局域网首屏现在优先读取同一 OCR2MD 发布目录中的 `vendor/` 公共组件字节镜像。WCP 自身 manifest + SHA256 验证、previous fallback 不变；只有上游正式发布组件在重新构建 OCR2MD 时被带入新候选（不在运行期间静默更换版本）。「设置」延后预热；工作目录 AG 与设置表同色，并新增固定目录单选列，模块切换后保留。详情与 UIC：`tests/LOCAL_FIRST_DEPENDENCIES_AND_WORKSPACE_SELECTION_UIC.md`。候选为 `v4-261014-2015`，稳定正式版仍 `v4-261014-0816`，实机 iPad 加速/交互等待用户确认。

> **现行部署架构（2026-10-14）**：V4 已改为「**一套物理静态文件、多个访问入口**」。正式版/候选版仍是两个受控发布槽位，绝非公网/局域网独立发布。本机 4176、Cloudflare 公网，以及局域网 4292（静态只读 symlink）读 `ui-spikes/v2/{v4-directory,v4-wp3-candidate}` 同一目录；局域网 Safari 应走新 HTTPS 4443 并由用户手动信任 Mac 本地 CA。**请勿再运行历史 `scripts/publish.mjs` / `release-public.mjs` / 独立 4292 发布**：旧覆盖脚本现已显式拒绝写入。唯一支持的流程为先构建+测试、再按审批发布候选、用户真机确认后按精确 build ID 晋级正式版。稳定公网仍为 0816，候选 1453，没有重新发布书库。完整拓扑、证书说明、Feature Contract 和 UIC 见 `tests/UNIFIED_RELEASE_NETWORK_UIC.md`。以下早期章节作为历史记录保留，若出现不同发布指导，一律以上述现行契约为准。

# OCR2MD V4 · WCP 渐进式接入

- v4 是独立应用入口；v3 继续运行、不重写、不搬运业务状态。
- 首页模板与样式从 2026-10-12 的 V3 拍摄固定快照，禁止让 V4 加载 V3 的 app.js 及任何真实 Vault 写入。
- WCP 正式 CDN Loader 只负责容器、插件注册及生命周期；`hostChrome:'external'` 使 V4 继承自己的 V3 模板顶栏。
- 当前**只有** `ocr2md:settings` 数据适配器注册到 WCP（`modules/settings.js`），实际独立组件为通用设置 UI；主标签只有「设置」。没有为工作目录或工作台预建导航、路径、源码和占位面板。
- 设置模块只有自己的 UI/状态、顶栏操作和存储；共享通用设置 Web Component 是 agent-link-monitor 发布的标准组件，不复制其实现。
- 当前设置数据仅含 5 条「设置界面」参数（源码字号、行距、注释、预览高度、强调色），在 `settings.schema.json` + `modules/ui-settings-model.js` 中；全部实际作用于通用设置 UI。V3 的 24 项设置快照仅存在 `migration-reference/`，`scripts/snapshot-settings.mjs` 只更新历史参考文件，绝不写回当前设置 schema。
- 现行浏览器保存键 `ocr2md-v4-ui-settings-v1`；旧 `ocr2md-v4-settings-v1`、V3 `ocr2md-v3-directory-settings-v1` 全部保留、不读取或覆写。真实 Mac Vault、DIRjson、OCR/PDF 不开放。
- 执行验证：从 OCR2MD repo 运行 `node ui-spikes/v4-directory/tests/settingsBrowser.mjs`；本地静态页面部署见 `scripts/publish.mjs`。
- 单模块验收标准与 UIC 详见 `tests/CONTRACT.md`；自动测试通过后仍需用户在 iPad 真机审核，然后才接入模块二。

## 2026-10-12 首模块历史验收记录（v4.0.0，当时尚未清理 v3 配置）

- 公网入口：**https://ocr2md.laity.bid/v4-directory/**（HTTP 200）。
- WCP 正式组件 `0.1.4`，之前的 `0.1.3` 保留为回退版本；新宿主外壳模式不要求改变 V3 的样式和导航。
- WCP 0.1.4 预发构建：Chromium、WebKit 的 V4 设置端到端场景均通过。
- 正式 Loader、本地静态 V4：Chromium、WebKit 均通过；正式公网 V4：Chromium、WebKit 均通过。场景验证 24 设置项、仅注册一个 OCR2MD 插件、外壳无重复顶栏、显式保存与刷新恢复、V3 storage key 不受影响。
- WCP 正式公网工作台回归：Chromium、WebKit 均通过（各有一条上游 AG Grid 36 RenderApi 警告，需要由共享设置组件所有者后续处理）；既有 OCR2MD WCP Alpha 的媒体/审计 CQE 测试 Chromium、WebKit 均通过。
- 本轮没有写入或改动 V3 运行代码、Mac Vault、章节或 PDF；V3 公网入口仍正常 HTTP 200。
- **人工审核：待用户在 iPad Safari 真机确认布局/触控。**不因 WebKit 自动通过而把真机状态标为完成；不自动开始下一个模块。

## v4.0.1 · 左上角应用组件版本清单

- 点击左上 `ocr2md v4 / v4.0.1...`，打开原生可访问的组件清单对话框；关闭按钮、Esc、点击遮罩都可退出，iPad 竖屏布局有单独的防溢出样式。
- 清单包含应用版本、WCP 当前稳定版及实际装载的独立模块版本。共享设置模块使用 `inspectComponents()` 报告自己加载的 `laity-settings-panel.version`，不猜测外部组件版本。
- WCP v0.1.5 的公共 `getComponents()` 负责从平台运行时读取已注册插件和 service；弹窗仅调用它而不穿透 ShadowRoot。
- 已核验的真实接入项为应用、WCP 平台、设置模块、通用设置 UI 共四项；工作目录/媒体/章节模块仍未迁入，不展示为已接入。
- v4.0.1 公网 Chromium + WebKit 自动测试全部通过，涵盖实际版本比对、按钮/键盘/遮罩关闭、小屏宽度、设置的保存与刷新；WCP Alpha 媒体 CQE 原回归全部通过。
- **iPad Safari 真机弹窗体验：待用户审核；**仍维持一次迁移一个模块的闸门。

## v4.0.2 · 组件与配置数据严格区分

- 「设置」只是 OCR2MD 的参数定义、编辑草稿和保存数据，通过共享「通用设置 UI」呈现；并非应单独列入版本清单的可复用组件。
- V4 的 `ocr2md:settings` 仍在 WCP 注册以管理 UI 生命周期与保存动作，但声明通用 `inventoryRole:'adapter'`，不向用户展示其适配层内部版本。
- 组件版本弹窗现列三项：OCR2MD 工作台、WCP Web 组件平台、通用设置 UI 的真实运行版本。其他真正的可复用组件在接入时正常列入。
- **iPad Safari 真机验收待审核；**V3 未改。

## v4.0.3 · 只显示已接入模块

- 删除 V4 主栏「工作目录」「工作台」两个禁用标签、工作路径导航、未接入模块的活动状态、工作目录/工作台整段静态占位 DOM、章节清洗与 DIRjson 无效工具，以及未授权的 Vault 占位配置。原有 V3 风格 CSS 和设置三窗视觉继续保留。
- 当前只显示一个「设置」主标签；AG/源码/预览只承载 5 个真正属于当前通用设置界面的参数。
- 调整 `settings.schema.json` 与 `modules/ui-settings-model.js`，实时将编辑结果应用到通用设置组件的源码字号、行距、源码注释、预览比例和强调色；显式保存、撤销重做保持现有交互。
- 新存储键 `ocr2md-v4-ui-settings-v1`；旧 V4 24 项配置、V3 目录配置均不再被当前模块读取或写入，不自动清理。
- 未接入的 V3 参数快照移至源码参考目录 `migration-reference/`，不会部署到 V4 运行站点；生成脚本也仅输出到该目录。
- 本轮不升级 WCP 0.1.6，不迁移工作目录/工作台业务。**iPad Safari 真机验收仍待用户审核。**

## v4.0.4 · 组件/功能组/参数名三列与完整值预览

- V4 使用共享通用设置 UI v0.1.15 的 `table-layout="components"` 模式，AG 表仅为「组件模块 / 功能组 / 参数名」。组件归属为显式 Schema `component="通用设置 UI"`，功能组为源码外观、面板布局、色彩，不用 OCR2MD 应用名冒充组件名。
- 选中 AG 或在源码定位参数后，「值预览」可见归属、功能、完整说明、参数 ID、类型、权限、约束、当前值与默认值以及可展开的完整 Schema。复杂 JSON 不截断，颜色/布尔操作与源码编辑、保存规则不变。
- 共享组件升级为 0.1.15；OCR2MD V4 通过官方 manifest 获取版本，并使用 `?v=...` 加载确切发布版。`table-layout` 缺省仍为五列，V3/其他旧消费者维持原 UI 行为。
- WCP 仍为 0.1.6，当前 V4 只注册设置数据适配器，未增加工作目录和工作台模块。iPad 真机待用户审核。

## v4.1.1 · WCP 工作目录 M0（2026-10-13）

- 第二个真实 UI 模块 `ocr2md:workspace` 与既有设置 `ocr2md:settings` 并列；另注册独立只读权威文件服务 `ocr2md:filesystem`。
- 文件服务使用 `V3DirectoryController` 无界面核心（V4 独立模块编译输出），所有目录/选择/预览操作通过 CQE 消息契约。无需将 V3 页面代码或真实 Vault 状态搬入 V4。
- 工作目录 AG Grid / CodeMirror 分列，名称双击或 iPad 触屏双击进入；源码只读；设置工作目录需直接存在 PDF；章节定界尚未接入。
- 公网真实 Vault 需要输入访问密钥；V4 使用独立 sessionStorage 键，不继承 V3 令牌。只读首段文件内容、无提交。其它可写文件管理操作以后单独实现/授权。
- V4 设置实例的「启用」列通过 AG column state 取消固定并排到「参数名」前；其它消费者原封不动。
- WCP 0.1.7 为外壳新增通用 `selectModule(id)`，V4 使用公开方法切换，不直接操作 Shadow DOM。V3 仍按原有逻辑运行。
- 详见 `tests/WORKSPACE_M0_UIC.md`。`tests/workspaceBrowser.mjs` 用无真实 Vault 的只读 Fixture 执行 Chromium / WebKit（含模拟触摸双击）；`tests/settingsBrowser.mjs` 完成设置回归；iPad 真机仍等待人工验收。


## v4.1.3 · 从同一 Safari 复用 V3 授权

「工作目录」未授权时点击「沿用 v3 授权」，由 v4 文件服务在浏览器同源 storage 查找 v3 token、向 Mac 验证后复制到 v4 的独立 session key。不会重写 v3 凭据，也不会通过 WCP bus 传 token。如果 v3 在不同标签页只使用 sessionStorage，则必须在已连接的 v3 标签页**保存未提交编辑后**直接导航到 v4 才能复用。详见 `tests/WORKSPACE_M0_UIC.md`。

## v4.2.0 · M1 标准 TriPane · 2026-10-13

- 将经过隔离候选验证的通用三窗正式接入 `ocr2md:workspace` 源码；AG/源码/预览统一通过 WCP TriPane `ag/source/preview` slots，Full 与 Compact 使用同一业务实例；仅视图模式改变，不重载文件/令牌。
- 使用 WCP 独立版本化组件 `TriPane 0.1.0`；V4 构建只复制经 SHA-256 校验的 WCP 发布资产，Dockview 只打包一次。`scripts/publish.mjs` 发布 V4 组件资产；不修改 V3 或 WCP 内核。
- 该阶段只读预览是文件详情/文本；工作台 PDF.js、章节/注释联动仍待后续独立模块。
- 验收契约：`tests/WORKSPACE_M1_UIC.md`。M0 的 iPad 实机通过不自动升级为 M1 真机通过。

M1 候选验证：WCP verify、工作目录 Chromium/WebKit 端到端与 LAN Chromium/WebKit 均通过；设置模块独立 Chromium 通过、WebKit 单独场景未完成（合并测试超时），M1 iPad 真机仍待审核。

## v4.3.0 · 工作目录导航双窗与设置后台预热（2026-10-13）

- 首页改为「工作目录」，AG＋只读 `laity-source-surface`（与设置模块同一共享版本 0.2.5 与 URL），删除冗余的第三个文本预览窗、专用 WorkingEditor。工作目录仍只读 Mac Vault，不增添任何文件写入能力。
- WCP TriPane 0.2.0 支持可选 `panes:['ag','source']`，未指定时仍默认 3 窗；业务与布局保持解耦。
- 「设置」启动时禁用，异步在离屏容器完整加载 AG、源码、值预览后解锁。设置组件始终连接到 document，通过 overlay 显示而不重挂载，规避 Shared Settings 的 `disconnectedCallback` 会销毁 AG Grid 的上游生命周期限制；回到工作目录时原实例保留。
- 测试/回退协议见 `tests/WORKSPACE_M2_UIC.md`；内网候选 `4292`，未发布公网。旧 M0 的手动 iPad 验收不等价于本次 M2 真机验收。

## v4.4.0 · 设置模块 TriPane 迁移（2026-10-13）

- 设置 AG 表、CodeMirror 源码、值预览从 Shared Settings 原生分隔条迁移到同一 WCP TriPane；同一个 Dockview/Gridview CSS，保留左 AG／右上源码／右下预览原有视图布局。
- `TriPane 0.2.1` 提供可选 `compactLayout:'right-stack'`；其默认 2/3 窗逻辑不变。Shared Settings 0.1.17 公网版、WCP 内核及 OCR2MD v3 均不修改。
- 设置启动时仍离屏预热，AG／源码／布局全部就绪后才开放设置标签，保留原组件实例的 AG、源码草稿、撤销/重做和保存行为。迁移只发生在 v4 的 `settings.js` 适配器中。
- 新的用户交互契约和验收门禁：`tests/SETTINGS_TRIPANE_M3_UIC.md`。目前仅更新内网 `4292` 候选，真实 iPad Safari 触控尚待用户实际使用观察。

## v4.4.1 · 工作目录常驻，不再切换时重新加载（2026-10-13）

WCP Runtime 切换时原本会调用工作目录 `unmount`，旧实现销毁 AG、CodeMirror 并重新读取 `/ocr2md`。这不是 Safari 整页刷新，而是重复装载业务模块。现在工作目录和设置一样保留常驻实例，`unmount` 只隐藏，重新挂载只显现原组件；目录位置、选中项、源码和 TriPane 均保留，不再重复读取目录或授权状态。用户明确点击「刷新目录」仍执行一次当前目录 `workspace.list`。正式 UIC 详见 `tests/WORKSPACE_KEEPALIVE_M4_UIC.md`，仅内网候选 4292，物理 Safari 待用户实际使用反馈。

## 开发与发布默认策略（2026-10-13 用户修正）

**默认开发与验收使用内网版 `http://192.168.1.10:4292/v4-directory/`。** 但如果用户明确表示 **iPad 正在外网、无法访问内网**，则切换为 **公网开发候选版发布与验收**，复用已有 `ocr2md.laity.bid` 域名及独立候选路径（例如 `/v4-tripane-candidate/`），先做安全和浏览器自动验收，再发布候选、核实公网访问；无需用户重复指定“发布公网”。这属于因设备处于外网而必要的开发分发，不代表正式版本已验收。**正式公网版 `https://ocr2md.laity.bid/v4-directory/` 仍独立，除非用户明确要求正式发布，否则不得覆盖。** iPad 恢复内网后回到默认的 4292 开发流。原先建议的 `/v4-dev/` 自动发布入口已撤销，当前没有启用自动公网发布；外网候选发布仍按每次需求执行。网络链路由 Agent Link 统一管理，不为 OCR2MD 自建隧道。

## v4.5.0 · WCP 插件自治（2026-10-13）

- 日常仍使用内网 `4292/v4-directory/`。**默认不自动发布公网**；外网 iPad 验收时发布独立公网候选，正式公网入口保留旧稳定版本。
- 功能插件源码位于 `plugins/<插件>/`；`plugin.json` 声明入口、类型、导航、排序、预热与可选 TS 构建项 `bundles`。`scripts/build-registry.mjs` 自动注册启用的模块，`scripts/build-modules.mjs` 按声明构建，不在 app.js 或 WCP core 写死功能名称。
- WCP `ResidentHost 1.0.0` 独立产物已供工作目录与设置共享。原 `modules/` 文件夹暂留为只读旧版本参考，不再由运行入口加载；新开发只能修改 `plugins/` 内当前功能的源码。
- `scripts/check-plugin-boundaries.mjs` 拦截跨插件引用与未获准的 Shell 内部依赖，四项正/反向门禁。WCP CQE 权威数据服务负责通信。
- 媒体插件 `plugins/media` 默认**禁用**，仅用作按需启用的模块自治实验；尚不包含 Vault 文件下载、清洗、改写功能。完整契约与 UIC：`tests/PLUGIN_AUTONOMY_V45_UIC.md`。

## v4.5.0 · 插件自治架构收口（2026-10-13）

**默认内网开发版：`http://192.168.1.10:4292/v4-directory/`。** 本轮把 V4 实际运行的设置、工作目录、独立只读文件服务的源码搬入 `plugins/<module>/`，每个目录用 `plugin.json` 声明 ID、UI/Service、排序、首页、预热与操作组；`scripts/build-registry.mjs` 生成 `plugins/registry.generated.js`，顶栏和 WCP app 入口从注册表自动创建导航、组装 CQE 与预热，不再写死插件 ID。旧 `modules/` 保留仅作迁移历史对照，不在 V4.5 运行入口注册，也不由新的 V4 发布脚本复制。

设置、工作目录现在共用 **WCP ResidentHost 1.0.0**（版本化 + SHA-256 校验），代替原来两份相似的离屏驻留代码；保留原 AG、CodeMirror、TriPane 实例，前后台切换不重建、不重复查询 Vault。

新增构建前门禁 `scripts/check-plugin-boundaries.mjs`，禁止跨插件 import、UI 直接访问未授权实现，以及在应用入口回写具体业务特例；仅为遗留 v2 AG 工具、v3 只读目录控制器设定精确共享白名单。四项正反门禁 4/4 通过。

`plugins/media` 是 **默认 `enabled:false`** 的独立媒体扫描试验模块，仅对测试副本临时启用：`media.scan` 通过 WCP CQE 连接扫描服务，Chromium/WebKit 均正确识别 Markdown 图片、HTML 表格和块级公式，新增/修改媒体代码不改变 `app.js`、其他模块的 SHA。**不代表图片下载、实际文档清洗或 Vault 写入已迁入 v4。**

内网候选 Chromium/WebKit 工作目录驻留验收 2/2 PASS，设置 TriPane 2/2 PASS；WCP `npm run verify`：architecture 4/4、CQE 5/5、TypeScript+Vite PASS；`node tests/mediaAutodiscoveryBrowser.mjs` 2/2 PASS；所有只读 Vault fixture 测试文件写入 0。实际 iPad Safari 手势继续以用户使用反馈为准，公网正式版和 v3 不动。详细契约见 `tests/PLUGIN_ARCH_M5_UIC.md` 与 `plugins/README.md`。

生命周期限制说明：ResidentHost 只负责已挂载的 UI 不随普通标签切换销毁，**不是持久数据总线、跨设备状态存储或浏览器安全沙箱**。未来若 WCP 运行时完整热替换，需额外验证/制定老 bus 端点迁移策略，不能假设驻留视图自动重连已经实现。

## v4.6.0 · 章节定界 WCP 插件（2026-10-13）

- `plugins/chapter-boundary/` 是独立顶栏插件；`plugin.json.activateOn='workspace.selected'` 与 `app.js` 的通用转场负责从「设为工作目录」自动进入章节定界。
- V3 `IrWorkbenchPanel` 与 PDF 适配源码已在独立插件目录内固化，复用共享 IR 纯算法、V2 AG/CodeMirror 与 PDF.js，三窗布局交给 WCP TriPane，驻留交给 ResidentHost；V3 风格使用插件本地 `legacy-theme.css`，不将 V3 全局样式混入 WCP。
- 所有 Vault 的读取、DIRjson CAS 保存、章节发布通过限定 `boundary.*` CQE 到独立文件服务；浏览目录仍只读，完整 IR 持久化须明确确认并读回校验。不得把密钥跨 CQE、插入 URL 或输出浏览器日志。
- `web-component-platform/tests/chapterBoundaryMigration.mjs` 用隔离真实文件服务与真实 PDF/OCR 测试自动打开、AG+源码+PDF、章节选择、行号补录、撤销重做、DIRjson 保存读回与备份发布；不写真实 Obsidian 文档。
- UIC / 业务契约见 `plugins/chapter-boundary/FEATURE_UIC.md`。实体 iPad Safari 的光标和触摸仍需用户手工验收，公网正式页面保持不变。

## v4.6.0 · 「章节定界」独立插件移植（2026-10-13）

已接入 `plugins/chapter-boundary/` 作为顶部独立 Tab。工作目录选中含原文 PDF 的书籍后，经 WCP CQE `workspace.selected` 自动切入「章节定界」。不重写 v3 的复杂章节定界算法，而是兼容复用完整 `IrWorkbenchPanel`、真实 AG Grid、CodeMirror 与 PDF.js Viewer；保留 H1 筛选、独立成章、补录/删除标题、撤销重做、DIRjson 版本化保存与已保存快照恢复、发布 Obsidian 兼容章节 Markdown。按 V3 颜色、行号/选中状态、Markdown 预览规则做插件局部样式继承，不污染 WCP 其他模块。`plugins/filesystem` 为唯一 Mac Vault 访问权限方，IR 读写和发布经 CQE 消息与 Mac 既有 CAS 服务，不通过浏览器直写文件。

**自动测试使用临时 Vault，不写真实用户书库。** Chromium/WebKit 真 PDF/OCR 双引擎验收、动态挂载/切换、快照持久化、正式章节发布。Safari 真机触摸和旧版外观对照仍须用户人工审核。详见 `tests/CHAPTER_BOUNDARY_V46_UIC.md`。内网 4292 开发候选，V3 和公网正式版本均未替换。

v4.6.0 定界 UI 跨浏览器兼容收尾：`plugins/chapter-boundary/legacy-theme.css` 保持 V3 AG、源码行号、标题与弹层配色，`legacy-preview.css` 是在本插件作用域的 V2/V3 Markdown 预览 CSS，PDF.js 原版 `pdf-viewer.css` 及缺失的 `images/loading-icon.gif` 均按本插件路径提供。WebKit 组合测试发现设置 TriPane 宿主 `.las-shell` CSS 同步时序问题，设置模块显式 `position:relative` 后，章节→设置→章节保活通过，原设置单独双引擎回归也通过。阶段 UIC 中标明实体 iPad Safari 样式/手势人工审阅尚未完成。


## v4.6.1 · V3 外观与 AG 三窗联动修复（2026-10-13）

- AG 点击任意标题行，CodeMirror 不抢 iPad 焦点、却使用对应 DIRjson range 显示金橙色持续高亮，AG 当前行标记同步更新；PDF.js 按 OCR `normalizedBBox` 定位页内橙框，旧高亮在下一次选择时移除。
- AG 顶栏恢复 v3 的章节标题、一级标题筛选、起始编号、状态；源码去多余标题栏；PDF/MD 预览与翻页工具位于下窗顶。保存 WCP TriPane 可拖动能力，业务逻辑仍局限在 `plugins/chapter-boundary/`。
- v3 PDF.js 的预览切换并不是卸载 PDF：当 MD 位于前景时，PDF 在后方保留尺寸和页缓存；AG 选行自动恢复 PDF 可见，并正确显示 bbox。这修复了 MD→AG→PDF 因 `display:none` 导致橙框丢失。
- 真实原书自动化 `web-component-platform/tests/chapterBoundaryAgPdfLink.mjs` 依次点第 18/20 页 AG 记录，在 Chromium/WebKit 验证三窗共同的块 ID、CodeMirror 高亮、PDF 3px 橙框、页码、MD→PDF 自动切换、V3 头部布局；测试拦截所有写请求，Vault 零写入。
- 仍需实体 iPad 真机验收视觉细节和触摸；内网 4292 默认开发版更新，公网正式版不变。


## v4.7.0 · 工作台与 v3 导航（2026-10-13）

- **顶栏**：`工作目录`、`设置`、**`工作台`**；章节定界与章节清洗分别为独立插件，但通过 WCP 的通用 `tabGroup` + `hiddenTab` 共用一个可见「工作台」Tab，不包含 OCR2MD 平台级业务分支。
- **路径导航**：由章节定界插件拥有，绑定已经激活的 root（不可跳出该书籍）；选 root → 章节定界，选 `chapters/` 或 `chapters/*.md` → 章节清洗。文件目录从授权 CQE 查询，发布后可以刷新。
- **章节清洗**：`plugins/chapter-cleaning/` 自包含 V3Workbench 与标题/媒体/表格/LaTeX 四种子模块，复用 V2 AG/CodeMirror 和 PDF.js，WCP TriPane 三窗；原生 Obsidian MD 正文允许编辑、撤销和重做，版本受控保存/媒体下载使用独立授权 CQE，不通过通用写接口。读取用户真实书籍的浏览器回归严格阻断 POST。
- **验收**：`web-component-platform/tests/workbenchV3Navigation.mjs` 在真实《Buffett’s Alpha》执行根→6 个章节的清洗→根，Chromium/WebKit 零写；`tests/workbenchV3SaveFixture.mjs` 在隔离 Vault 执行定界→发布→章节编辑→原 Mac CAS 保存和读回，真实用户库无变动。
- 契约见 `plugins/chapter-cleaning/FEATURE_UIC.md`；实体 iPad 视觉手势待用户审核；清洗时 MD 块→原 PDF bbox 自动映射仍需后续 Sidecar 子模块完整迁移。


## v4.7.1 · 顶栏公共编辑按钮与模块工具条（2026-10-13）

- 工作台路径选择器只显示目录名（末尾 `/`）或章节 MD 文件名，选项仍保留原完整路径作为 CQE 值；根/chapters 的业务路由保持不变。
- 顶栏右侧固定 **撤销／重做／保存标定** 三按钮，只通过插件 manifest `globalRole` 绑定当前模块已有命令；旧命令在不可见托管容器里维护各自禁用状态、事件处理，WCP 无文件写权限也无模块内对象引用。
- 下方新增固定模块工具条，设置/章节定界/章节清洗自主提供功能控件；AG 过滤器仍在 AG 头，PDF 页码/缩放仍在预览局部控件。UI 交互约定及检查清单见 `FEATURE_UIC_TOPBAR.md`。
- 真实书籍只读 Chromium/WebKit，隔离 IR 发布 + 清洗 CAS 编辑写入，设置 AG/源码/预览回归；实体 iPad 横竖屏触摸仍留手动审核。

## v4.7.2 · WCP 状态与简化界面（2026-10-13）

统一四模块的状态进入底部框架状态栏，基于通用 `wcp:module-status` 事件按当前模块 ID 选取缓存的最终消息；原业务状态节点仍可由内部订阅器读取但不占页面布局。完整构建版本、组件清单只放版本弹窗，头部仅 `ocr2md v4` 应用入口。章节定界/清洗 AG 不显示重复的标题行，必要筛选及序号改放模块按钮区。具体 Feature/UIC 见 `FEATURE_UIC_FRAME_STATUS.md`。只在内网开发环境部署，真实 iPad UI 仍待验收。

## v4.7.3 · 状态上移及路径导航显示（2026-10-13）

- WCP 唯一状态栏移至最顶部，与 `ocr2md v4` 版本弹窗按钮同一行紧邻显示；底部不再占空间。只改变 DOM/CSS 位置，消息通道和状态缓存行为不变。
- 工作台导航由章节插件把完整工作目录/章节 MD 路径和当前模块名称组合为可见标签，如 `章节定界：/ocr2md/Bufett’s Alpha` / `章节清洗：/ocr2md/Bufett’s Alpha/chapters/00 Buffett’s Alpha.md`。下拉值原样保留路径并经原 CQE 路由。
- 点 `chapters/` 时实际选中第一份 MD，而不是让顶栏停留在模糊的目录路径。UIC 见 `FEATURE_UIC_FRAME_STATUS.md` 的 STAT-08 至 STAT-12。

## v4.7.4 · 「独立成章」AG 性能与勾选启用修复（2026-10-13）

- 解决“载入已保存 DIRjson 时 AG checkbox 因 busy 状态未解除禁用”：在打开完成或保存/发布 busy 状态变更后，**只刷新 AG 独立成章列**，不再重建整个表格。
- 独立成章 checkbox 使用插件专属 `applyStandaloneCut`：复用已有领域转换与 DIRjson 校验，更新所影响的 AG 行和章文件名，不再全量重建 CodeMirror/Markdown/PDF，保留首标题锁定、撤销重做和 dirty 状态。
- 巨大的章节 MD bundle 延迟到实际保存/发布/导出/证据查询才重新生成，保证文件版本与当前 DIRjson 一致；完整审计详情见 `plugins/chapter-boundary/FEATURE_UIC.md` 中 BND-12。默认内网候选，公网 v4 正式版和 v3 不受影响。

## v4.7.5 · 定界标定小型 CAS（2026-10-13）

- 章节定界已存 DIRjson 的「独立成章」勾选和文件分组采用独立 `/.ocr2md/ir-markings.v1.json` 小型 CAS sidecar，读取时 overlay 到不可变 DIRjson base；用户明确发布时才重新生成完整 ZIP 和 MD。
- 严格绑定 `generation` 与 `revision`，Mac 原生协调写入，校验 PDF/OCR source SHA，限制标定对象类型和载荷；正文改动仍走完整快照。使用通用 WCP CQE，不改平台内核。
- 版本说明与 UIC：`plugins/chapter-boundary/FEATURE_UIC.md` 中 BND-13。独立 LAN 候选从原公网后端分离，不允许未经验收切换公网服务。

## v4.7.5 · 标定记录增量 CAS（2026-10-13）

- 独立成章和章节编号的保存，从整本 ZIP 上传改为 48 KiB 上限的 `ir-markings.v1.json` 标定记录（典型约 3–6 KiB），原 ZIP 和 PDF/OCR 不变。
- 新增 `boundary.ir.markings.read/save` CQE 以及 `ocr2md:filesystem` 专用短请求服务，server 验证书籍/generation/revision 和 OCR/PDF SHA；侧录仅标定层，不另造文档引擎。
- 重新打开时按基准快照合并小标定；仅在用户正式发布/源码编辑时物化完整 ZIP 并使用原 `/__v3/ir/commit` CAS/SHA。发布新版本后原 sidecar 自动失效。旧客户端无法覆盖尚未合并的活动标定。
- 隔离真实大小书测试：2,575,431 字节原 ZIP → 2,720 字节 sidecar（后端直接保存）；浏览器 CQE 标定 POST 通常 3–6 KB。双引擎保存→重载→再次保存→编号保存通过，WebKit 发布物化与 SHA 通过。详细业务契约见 `plugins/chapter-boundary/FEATURE_UIC.md` BND-13。
- 仅 4292 内网候选，真实 Mac Vault 未被自动测试改动。公网稳定版和 V3 仍保持不变；用户需在实体 iPad Safari 审核实际速度。


## 构建版本号与用户核对（BLD-01）

- `node ui-spikes/v4-directory/scripts/build-modules.mjs` 每次在构建成功后自动标记 `v4-YYMMDD-HHMM`；到秒的时间写入 `ui-spikes/v4-directory/build-info.json`，例如 `v4-261014-0757`。
- `node ui-spikes/v4-directory/scripts/publish.mjs` 将带版本号的 v4 本地文件拷贝至 `ui-spikes/v2/v4-directory/` 并核对插件资产哈希。**本地构建不自动替换 LAN 4292 或公网服务**。
- `node ui-spikes/v4-directory/tests/buildVersionBrowser.mjs` 在本机隔离静态服务器上用 Chromium 和 WebKit 验证顶栏/弹窗、宽窄屏布局与全部静态文件 SHA。
- 每次构建或测试后的答复必须报告：**构建版本**、**运行并通过的测试**、**实际部署入口及是否与构建版本一致**。用户只需要对照页面标牌便可确认是否是本轮代码。

## 2026-10-14 · iPad 版本自动分发（BLD-05–08）

后续开发应当将以下单条命令作为**默认构建+验收+LAN 分发流程**：

```sh
node ui-spikes/v4-directory/scripts/build-test-push-ipad.mjs
```

它按顺序执行 `build-modules` → `publish` → `buildVersionBrowser` → `release-lan`。通过后才会替换现有 `4292` 静态页面，并在终端打印真实上线版本及留存的回退路径；前端每分钟检查新构建，无草稿才自动切换。`build-modules.mjs` **单独运行仍只是编译，不代表自动推送或实际部署**。原 4292 Python 后端没有更新时，分发门禁会直接报 `RELEASE_BACKEND_RESTART_REQUIRED`，不改变正在服务的页面。公网 `ocr2md.laity.bid` 正式版继续独立保护，不自动发布。

页面点击顶栏版本标牌，可同时看到构建 ID 与“访问入口：局域网/本机／公网域名”；不能通过 Safari Web API 取得 iPad 当前 Wi-Fi、SSID 或蜂窝网络状态。旧版还没有自动检查代码，因此**第一次从旧版迁移至少需要重新打开一次**。详情及测试见 `FEATURE_UIC_FRAME_STATUS.md` 的 BLD-05–08。

## 2026-10-14 公网 canary 0816 → 0838

用户确认外网 iPhone 旧版本 0816 并同意实验。`release-public.mjs` 仅对经 Mac 4176 服务映射、局域网/公网实际服务版本核验通过的 v4 静态目录进行独立候选全量测试和双 rename 切换；保留完整 0816 回退目录。当前后端 4176 进程早于源码变更，所以该脚本只接受严格验证**纯版本号和缓存键变化**的 canary；真实功能改动必须先完成前后端兼容验收。Chromium/WebKit 静态页面测试、Cloudflare 公网资源检验，以及旧页 JS → 实际新 HTML 的 WebKit 自动升级测试均通过；实体 iPhone 页面是否换标牌仍需设备反馈。已部署版本：`v4-261014-0838`。

## WP2/4 · 启动失败可恢复与完整升级验收（2026-10-14）

`index.html` 搭载独立同步 Bootstrap，`app.js` 的静态模块 import 通过 Bootstrap 的 `import()` 捕获，跨域 WCP Loader、插件注册表加载错误均不会造成没有错误提示的空白页。框架状态栏展示失败，已有版本详情展示非敏感错误代码、启动阶段及公共资源来源，只有安全状态才允许手动恢复。独立 `tests/wp2UpgradeGate.mjs` 用真实 WCP、完整插件注册表对候选进行旧版升级和故障注入。正式公网部署脚本强制执行此测试，原有后端源代码版本门禁仍保留。

**局域网自动发布与公网正式发布严格隔离**：`build-test-push-ipad.mjs` 不再调用 `publish.mjs` 以免间接覆盖 4176 公网服务；改为使用临时目录校验并只向 4292 发布。`release-lan.mjs` 的源为当前已构建的 `ui-spikes/v4-directory`，不是稳定公网目录。具体 UIC 与测试场景：`tests/UPGRADE_WP2_UIC.md`。

截至此阶段，公网继续提供 `v4-261014-0816`，构建出的 `0916` 为候选，真实 iPhone 未验证；**不要把 WebKit 自动化通过当成可上线验收**。

## WP3/4 · 独立公网候选与真实 iPhone 验收（2026-10-14）

独立候选入口：`https://ocr2md.laity.bid/v4-wp3-candidate/`，部署 `v4-261014-0916`；正式 `/v4-directory/` 仍为 `v4-261014-0816`。WP3 部署不修改 Cloudflare/4176 服务或书库，`release-wp3-candidate.mjs` 从当前已构建的源码抽取浏览器运行文件，先通过 WP2 真实 WCP 升级门禁，然后从 Mac 本机及 Cloudflare 公网验证 SHA。`wp3PublicCandidateBrowser.mjs` 用真实公网地址、真正 WCP+插件/AG UI 完成 WebKit 和 Chromium 只读浏览器预验收。**实体 iPhone Safari 尚待用户审核，不能宣称 WP3 真机通过**；请不要在候选页面修改/保存真实书库数据。详细步骤和结果见 `tests/UPGRADE_WP3_PUBLIC_CANDIDATE.md`。候选初次打开通过后，再讨论独立候选地址上的升级演练。


## WP3 iPhone 自动升级后的 AG Grid 空表问题（2026-10-14 10:37）

实体 iPhone 从 0916 自动变为候选 0948，但状态「已加载 5 项」时网格行仍不可见，**WP3-06 失败**。这不同于完整空白页，证明版本更新+目录请求不等于完整界面可用。WebKit/Chromium 利用合成 5 行和实际 WCP/AG 运行代码的自动升级测试 2/2 通过，但没有复现 iPhone 问题，不能用模拟结果代替实机。问题、保留的候选回退版和后续诊断见 `tests/UPGRADE_WP3_PUBLIC_CANDIDATE.md`。正式 0816 不变；WP4 正式发布门禁继续冻结。


## WP3 AG Grid 空行诊断候选（2026-10-14 11:48）

诊断候选 `v4-261014-1148` 已仅部署在 `/v4-wp3-candidate/`，稳定公网 `/v4-directory/` 保留 `0816`。该版本只添加 WCP 工作目录 AG Grid API 模型/筛选/渲染/DOM/可见行计数与仅在故障时可用的「重绘表格」，不记录或上传用户文件、密钥。合成 5 行旧→新自动升级 WebKit/Chromium 2/2、WP2 6/6 与实际公网浏览器 2/2 均通过，但实体 iPhone 的空表根因仍待诊断数字。禁止自动将该诊断版本升入正式环境。见 `tests/UPGRADE_WP3_PUBLIC_CANDIDATE.md`。


## WP3 实机空表：重绘无效后的行坐标诊断（2026-10-14 11:58）

用户确认在 1148 点击「重绘表格」后仍有 `模型5 / DOM5 / 可见0`。候选 `v4-261014-1158` 已经严格受限地上线独立 `/v4-wp3-candidate/`，增加首行与 `.ag-row` 相对网格的数字坐标、滚动及 CSS 状态，不采集文档内容。模拟 5 行完整升级 WebKit/Chromium 2/2、正式升级门禁 6/6、公网清单及文件校验都通过；实体 iPhone 的实际坐标尚待用户截图。生产 `0816` 不变，WP4 暂缓。详见 `tests/UPGRADE_WP3_PUBLIC_CANDIDATE.md`。


## 2026-10-14 13:44 · 候选版 1344 外网实机验收

独立 `v4-wp3-candidate/` 已部署 `v4-261014-1344`；正式 `v4-directory/` 仍为 `0816`。工作目录改为在可见 ResidentHost 中初始化 AG，增加 AG Grid Community 官方结构样式的先加载。发布前 6/6 完整升级和两引擎真实可见行坐标验收均通过（第一行 y≈43、5 行）；公网 WebKit/Chromium 实际 HTTP/WCP 启动、资源校验通过。**iPhone 真机尚待确认**，所以 WP3 与 WP4 尚不可宣布正式通过。细节与回退位置见 `tests/UPGRADE_WP3_PUBLIC_CANDIDATE.md`。
