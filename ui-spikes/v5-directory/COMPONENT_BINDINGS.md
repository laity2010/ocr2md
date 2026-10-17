# OCR2MD V5 · 仅通过公共 API 组装组件

权威源码、发布版本、使用协议：

| 组件 | 唯一源码目录 | V5 引用 | 功能边界 |
| --- | --- | --- | --- |
| WCP AppFrame | `../../../web-component-platform/src/component/app-frame/` | `vendor/wcp/components/app-frame/v1/releases/1.0.1/` | 标牌、状态、组件目录、导航、操作按钮和布局外框 |
| WCP Core | `../../../web-component-platform/src/` | `vendor/wcp/components/v1/loader.js` + released runtime | 模块生命周期、CQE、Dockview |
| Shared Settings | `../../../agent-link-monitor/shared-settings/src/` | `vendor/shared-settings/v1/releases/0.1.18/` **开发构建快照** | AG/CodeMirror/源码/值预览、公开布局 API、列和参数显示 |
| TriPane/Resident | `../../../web-component-platform/src/component/` | `components/`（已冻结发布镜像） | 三窗拆分、驻留状态 |
| MOPJO | `../../packages/mopjo/src` | 尚未接入 | 独立 IR / 增量 / 章节/MD API |

V5 只声明应用名称、版本号、模块元数据、配置 schema、路由和业务状态。`app.js` 不实现标牌/状态栏/组件目录/导航。`plugins/settings/settings.js` 是 OCR2MD 专属 Settings 配置适配器，不是共享组件的另一份源码，**禁止访问 Settings `_gridApi` / `_codeSurface` / `_els` / `_wcpTriPane` 或私有 `.las-*` DOM**。

开发即时上线契约（2026-10-17 用户确认）：OCR2MD V5 不划分候选版/正式版，功能测试通过立即更新**唯一**内网/公网共享入口。`scripts/publish-single-release.py` 直接调用共享 Settings 权威源码的 `npm run build` 得到隔离构建产物，校验 WCP AppFrame 源发布资源 SHA，原子替换单个 `.runtime/ocr2md-public` 目录并保留回退。**不改动**共享 Settings 中央稳定版 manifest；V5 的运行 manifest 是当前开发构建专属快照。保留文件系统敏感 API 403 防护。

测试：`node tests/wp2-component-candidate.mjs`（零公网流量、零写操作，Chromium/WebKit），`node scripts/check-plugin-boundaries.mjs`，`node scripts/verify-v4-freeze.mjs`，`node scripts/publish-single-release.py` 被拒绝属于预期负向测试。发布后再跑 LAN-first、远程 SHA parity 和实体 iPad Safari 截图。所有未提交 WIP、V4 冻结源码和线上发布目录均保留。

## 实际注册双标志契约（2026-10-17）

组件是否已正确加载引用，以 WCP 内核的 `runtime.getComponents()` 为准；只有它返回的实际注册组件才具有两个统一标志：

1. WCP AppFrame 组件目录里出现。V5 `onCatalog` 只把 WCP `getComponents()` 原样交给 `frame.setCatalog`，不再手工补加 filesystem/service。
2. Shared Settings 必须有对应行。没有设置定义时由其公开 `setComponentCatalog` 自动补 **只有组件模块列为名称，其他列全空** 的只读占位行；不创造假参数/复选框，不改写 schema/源码/存储。

V5 通过 `wcp:component-catalog` 事件原样转发 WCP 已加载清单，初始化后和 WCP `wcp:active` 时均同步；业务插件不直接接触 Settings AG/CodeMirror。此前 V5 过早注册 `ocr2md:filesystem`。在本次 AEL 整改中它已从当前注册列表撤下；工作目录接入后实际组件清单为 `platform:wcp`、`ocr2md:workspace`、`ocr2md:directory`、`shared:settings`、`wcp:tripane`。目录服务只列举目录和发布路径，不执行文件内容读取或 DIRjson 处理，旧混合 filesystem 继续禁用。

Settings 0.1.18 已从权威源码直接构建并部署为 OCR2MD V5 当前开发版（中央稳定版指针保持 0.1.17，不要求先推广它）。`node tests/wp2-component-candidate.mjs` 用于预检，`tests/live-dev-ui.mjs` 在 LAN 实际入口作 Chromium/WebKit 验收，`tests/single-release-parity.py` 比较内外网 9 个实际资源 SHA。

## 工作目录与 MOPJO 的固定边界（2026-10-17 用户纠偏）

**工作目录模块只承担目录导航**：枚举/定位/选择目录和导航状态。不得负责 DIRjson 加载解析、章节判断、JSON 原始与增量、MD 投影或章节发布；也不得复制这些处理器作为所谓“工作目录后台服务”。MOPJO 唯一权威源码 `../../packages/mopjo/src/` 处理全部 DIRjson 数据模型及变更投影，对外通过稳定 API 使用。底层目录列举和字节读写可以有独立通用存储接口，但不能携带业务文档语义；WCP 只管理组件注册与消息路由。

现存 `plugins/filesystem/workspace-fs.js` 是遗留打包文件：包含 `workspace.list`、`boundary.ir.load` 以及 `clean.chapter.begin/append/commit`。虽当前白名单不开放后两类处理器，但代码归属仍然混杂，**不可直接把整个包划给工作目录**。先只记录审计偏差 `V5-OWN-001`（错误规划建议、未实施）和 `V5-OWN-002`（现存打包混合代码），后续应在权威源码位置分别拆清。AEL 为 advisory only；不得为了消除告警直接改名、删测试、擅自更动 V4/WIP 或 MOPJO。

## AEL 越界修正：当前活跃服务不得混入文档业务（2026-10-17）

原 `plugins/filesystem/workspace-fs.js` 属于历史遗留 WIP，混有 `boundary.ir.load` 与 `clean.chapter.*`（不得归入工作目录）；不能因为它曾可被 WCP 加载，就认为它拥有 DIRjson。**现禁用 `plugins/filesystem/plugin.json` 注册，并由确定性的 registry 构建器排除它。** 唯一发布器仅复制启用模块目录，不把旧混合代码提供给浏览器。原字节保留在未激活源码中供所有权审计；AEL `V5-OWN-002` 仍须保留为未完成的遗留源码拆分事项，而运行时越界应已经消除。

用户冻结原则：工作目录只做目录导航；MOPJO 权威源码独占 DIRjson 解析/原始与增量/MD 投影及其业务逻辑；IO 应为独立、无 DIRjson 语义的通用存储接口。工作目录 UI 正式接入时仅装配其真实依赖，绝不把旧混合 bundle 整包重新启用。WCP 清单与 Settings 空白模块行均以当前真实注册为准。

## 公共自动更新所有权修复（2026-10-17）

WCP `src/component/app-frame/index.js` 是唯一版本监听/更新实现，发布资产 `vendor/wcp/components/app-frame/v1/releases/1.0.2/` 是不修改的字节镜像。V5 `app.js` 只通过公开 `frame.watchBuild` 提供 `metadataUrl`、`htmlUrl`、`htmlBuildSelector`、`saveEvent` 以及业务 `isDirty()`。本地 `assets/app-live-update.js` 已撤除，禁止再次复制 AppFrame 生命周期逻辑。

WCP 实现负责每15秒轮询与 Safari 恢复前台、按真实 `data-build-id` 复核 HTML/清单的一致性、编辑输入焦点保护、草稿延迟以及提示。**继承旧 V4 已验证更新语义，V4冻结源码不变。** WCP 自己的 Chromium/WebKit 端到端测试为权威实现测试，V5 `tests/app-auto-update-browser.mjs` 仅验证引用与SHA边界，LAN 浏览器测试验证真实自动检查请求。开发版新构建直接上线唯一入口。

## WCP 统一 0.1.11 发布（2026-10-17）

WCP Core 与 AppFrame 只有一个**平台版本** `0.1.11` 和一个权威 `published/components/v1/manifest.json`。V5 只从 `vendor/wcp/components/v1/loader.js` 导入公共 `mountWcp` 与 `createWcpAppFrame`；二者通过同一 stable 清单和各自 SHA 验证加载。`frame.watchBuild` 自动更新 API 继续来自 AppFrame 内部。此前独立发布的 AppFrame 1.0.1/1.0.2 仅保留历史兼容，不再对外计版本或进入 V5 发布包。版本标牌应显示 WCP Core/Frame **相同的** 0.1.11，而不是多套版本。若本文件更早段落仍写 AppFrame 1.0.x，请以本节为准。
