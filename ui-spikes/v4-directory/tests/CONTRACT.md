# OCR2MD V4 / WCP · 首个接入模块验收契约

## FC-V4-SET-001 · 通用设置
- 操作：打开 V4 的「设置」，在 AG 表选项/右侧源码编辑参数，撤销、重做、重置、保存，再刷新。
- 需要：WCP 0.1.6+ 官方 Loader、发布的共享设置组件，V4 独立应用 schema 及本机浏览器本地存储。
- 效果：继承 V3 顶栏与 AG＋源码＋预览视觉，主标签只包含已经接入的「设置」；5 项设置 UI 自身参数真实控制源码字号/行距/注释、预览高度、强调色；保存仅影响 V4 当前设备，刷新恢复；有未保存修改时 WCP 不允许热更/回退。
- 禁止：不能改 V3 设置和浏览器存储键；不能调用真实 Vault/DIRjson/PDF/章节写入；不接入媒体/章节业务插件；不能出现第二套 WCP 导航顶栏。
- 固定样例：修改 sourceFontSize=13→15，即时反映到源码窗 → 保存 → 刷新仍为 15 → 恢复 13 并保存；测试前后 V3 与旧 V4 的存储值保持不变。
- 自动验证：tests/settingsBrowser.mjs，WCP npm run verify:full。
- 人工审核：**待用户审核**（真实 iPad Safari 页）。

## UIC-V4-SET-001 · 组件首屏
- 初始状态：V4 独立路径、设置标签选中；工作目录及工作台尚未接入。
- 用户动作：打开 V4 页面。
- 预期界面：V3 顶栏视觉保持，WCP 外壳隐藏，主标签仅「设置」；AG 表仅 5 条 `group=设置界面` 的配置项，源码与参数预览可见，无工作目录或工作台的占位控件/表格/源码。
- 数据副作用：无。
- 不变量：只有 ocr2md:settings 被注册，V3 原入口与业务数据不改。
- 自动化：browser，tests/settingsBrowser.mjs。

## UIC-V4-SET-002 · 设置显式保存与恢复
- 初始状态：sourceFontSize=13，存储键 `ocr2md-v4-ui-settings-v1`（与 V3、旧 V4 24 项快照隔离）。
- 用户动作：修改、撤销/重做、点击保存配置并刷新。
- 预期界面：草稿历史正确，保存后 V4 重新打开使用新值。
- 数据副作用：仅写入浏览器 localStorage 的 V4 键。
- 不变量：V3、旧 V4 的存储键及一切文件不变。
- 自动化：browser，tests/settingsBrowser.mjs。

## UIC-V4-SET-003 · 外部真机
- 初始状态：Safari iPad 访问 V4 正式 URL。
- 用户动作：竖/横屏打开、触控 AG/源码、保存与刷新。
- 预期界面：V3 结构不走样、触控可用。
- 数据副作用：仅该设备浏览器本地存储。
- 不变量：不得把 WebKit 模拟测试当成 iPad 真机验收。
- 自动化：manual-external；状态：**待用户审核**。

## FC-V4-SET-002 · 未接入模块不得占位
- 操作：首次进入 V4 设置界面，检查顶栏、组件活动状态、AG 设置组、参数源码和发布的模块文件。
- 需要：V4 当前实际只注册 `ocr2md:settings`，其数据适配层消费通用设置 Web Component。
- 效果：导航仅一项「设置」；不出现工作目录和工作台 tab、状态、空面板、路径导航、文件授权和任何相关设置项；未来模块接入应由自身携带导航和配置，不预建空壳。
- 不变量：WCP 平台版本不动，V3 原入口/数据不动；保留旧 V4 数据，不自动迁移为设置 UI 数据。
- 自动验证：`tests/settingsBrowser.mjs`（Chromium、WebKit），静态 HTML 与 schema 检查。
- 人工审核：**待用户审核**（iPad Safari）。

## UIC-V4-SET-004 · 设置数据范围
- 初始状态：配置源码仅含 `sourceFontSize`、`sourceLineHeight`、`sourceComments`、`previewHeight`、`accentColor`。
- 用户动作：编辑源码字号，保存，刷新；核对工作目录/工作台配置及文件并未出现。
- 预期界面：新字号即时作用到通用设置源码窗；刷新后仍保留，原 24 项配置不混入。
- 数据副作用：仅写 `ocr2md-v4-ui-settings-v1`。
- 不变量：旧 `ocr2md-v4-settings-v1` 及 `ocr2md-v3-directory-settings-v1` 未改变。
- 自动化：browser，`tests/settingsBrowser.mjs`。

## FC-V4-SET-003 · 三列参数目录和值预览
- 操作：打开 V4 设置，在 AG 选择任意参数或在源码中定位参数；下方「值预览」查看完整信息和当前值。
- 需要：通用设置 UI v0.1.15+ 的通用 `table-layout="components"` 功能，Schema 声明 `component` 和 `featureGroup`；V4 不自行实现另一份 AG/预览。
- 效果：AG 仅三列「组件模块、功能组、参数名」；值预览显示完整参数名、所属组件、功能组、ID、说明、类型、默认值、完整当前值、权限、约束、完整 Schema；长 JSON 不截断。源码仍可编辑，颜色和布尔值预览操作继续有效。
- 禁止：AG 不出现参数值、描述或其他冗余列；不得把整个 OCR2MD 应用名当作组件模块名称；不得改变旧 V4/V3 持久化配置。
- 固定样例：`sourceFontSize` 行显示「通用设置 UI / 源码外观 / 源码字号」，预览当前值 13、默认 13、类型 integer；布尔值预览显示选择按钮。
- 自动验证：`SHARED_STAGE=1 node ui-spikes/v4-directory/tests/settingsBrowser.mjs` 和公网相同脚本，Chromium/WebKit。
- 人工审核：**待用户审核**（iPad Safari）。

## UIC-V4-SET-005 · 三列、真实模块归属、完整预览
- 初始：Schema 5 项，仅一个通用设置 UI 组件。
- 用户：选中 AG 或源码参数、打开完整参数定义；编辑参数值并保存刷新。
- 预期界面：AG 只有三列，模块和功能组取 Schema 显式字段；源码和预览同步，参数的所有值及长复合值不截断。
- 数据副作用：只写已有 `ocr2md-v4-ui-settings-v1`；无额外冗余缓存。
- 不变量：WCP 运行架构、V3 界面与 Schema 不变。
- 自动化：browser，`tests/settingsBrowser.mjs`。

## FC-V4-VER-001 · 应用组件版本清单
- 操作：点击顶栏左侧「ocr2md v4 / 版本号」，查看逐项组件版本，再点关闭、按 Escape 或触碰弹窗外部关闭。
- 需要：WCP 0.1.6+ 的 `getComponents()` 公共只读 API；可复用组件通过 `inspectComponents()` 报告版本，业务配置桥标记 `inventoryRole:'adapter'`。
- 效果：弹窗列出 OCR2MD 应用、WCP 平台、实际复用的组件名称、ID、版本；每次打开重新读取清单，不将配置数据的生命周期适配器算作独立组件。
- 禁止：不得硬编码业务模块名单或读取 WCP Shadow DOM 内部菜单；未迁移业务不得显示为已接入；不产生文件或配置写入。
- 固定样例：设置初始化完成后打开弹窗，依次看到 OCR2MD、WCP、通用设置 UI 三行；设置数据/配置适配器仍在平台注册且正确保存，但不列出独立组件版本。
- 自动验证：`tests/settingsBrowser.mjs`（Chromium 和 WebKit）、WCP Alpha 回归。
- 人工审核：**待用户审核**（iPad Safari）。

## UIC-V4-VER-001 · 顶栏触发与版本来源
- 初始状态：弹窗关闭，设置模块运行中，顶栏保持 V3 布局。
- 用户动作：点击 / 键盘 Enter 激活顶栏版本按钮。
- 预期界面：原生 dialog 显示应用、平台和实际组件的名称、版本与 ID；配置适配器隐藏；WCP 升级/插件替换后再次打开应显示最新值。
- 数据副作用：无；只调用 WCP `getComponents()`。
- 不变量：不存在第二套应用顶栏、无尚未接入的组件、不能访问正式 Vault。
- 自动化：browser，`tests/settingsBrowser.mjs`。

## UIC-V4-VER-002 · 弹窗退出和小屏
- 初始状态：组件版本弹窗打开。
- 用户动作：关闭按钮 / Esc / 点击遮罩，iPad 竖屏操作。
- 预期界面：弹窗关闭，回到设置页；可再打开；窄屏无横向溢出。
- 数据副作用：无。
- 不变量：设置草稿不丢失，不改变当前 WCP 插件状态。
- 自动化：browser（WebKit 竖屏模拟），manual-external（iPad Safari 真机）。
