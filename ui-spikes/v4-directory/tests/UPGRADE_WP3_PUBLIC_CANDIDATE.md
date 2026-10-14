# OCR2MD V4 WP3/4 · 独立公网候选版 iPhone 验收

日期：2026-10-14。**正式稳定版 `https://ocr2md.laity.bid/v4-directory/` 继续使用 `v4-261014-0816`，不得因 WP3 自动覆盖。**

## 候选版本及真实公网入口

- 候选构建 ID：`v4-261014-0916`（2026-10-14 09:16:38 UTC+08）。
- 真实候选地址：`https://ocr2md.laity.bid/v4-wp3-candidate/`。
- 由已存在 Cloudflare 隧道转发到 Mac 上现有 4176 静态文件服务；没有改动隧道/DNS/进程及 Mac Vault 数据。
- 独立静态目录：`ui-spikes/v2/v4-wp3-candidate/`。同源独立路径保证相对模块导入不读取旧版 `/v4-directory/`，但**注意同域名仍共用旧 4176 书库 API**。本轮仅做启动/界面只读验收，不在候选页面执行真实保存/发布，以免影响用户库。
- 用 `scripts/release-wp3-candidate.mjs` 从已构建的 v4 版本拷贝仅浏览器运行需要的 `.js`、`.json`、`.css`、字体、图片和 worker，剔除 TS 源码、测试及工程文档。发布前运行真实 WCP 完整升级门禁，后核对内网与公网 URL 的 build-info、HTML 版本标牌及 8 个 manifest 哈希文件；失败移走候选目录保留失败快照，绝不替换稳定版。

## 操作/预期效果/UIC

| UIC | 起始状态与操作 | 预期效果 | 数据副作用与不变量 | 自动化等级 |
|---|---|---|---|---|
| WP3-01 | 从外网打开候选入口 | 浏览器显示 `ocr2md v4-261014-0916`，导航中有工作目录、设置、工作台 | 稳定入口仍为 0816；不改书库 | 自动 WebKit/Chromium 及实体 iPhone 截图均通过 |
| WP3-02 | 点击顶栏版本标牌 | 可看到构建时间及 `启动诊断：v4-261014-0916 / ready / mounted` | 无向后端上传诊断、授权或用户文件 | 自动初始化与实体 iPhone 版本弹窗截图均通过 |
| WP3-03 | 断开跨域 WCP Loader/恢复网络后尝试重试 | 页面显示失败和重试，不因看到新版号就宣称 ready | 未保存状态阻止刷新 | WP2 WebKit/Chromium 故障注入通过；iPhone 真机不主动干扰网络，人工观察 |
| WP3-04 | 候选真实页面加载，检查工作目录 AG 表和顶栏导航 | AG 表挂载、可见；390px iPhone 宽度不横向溢出 | 自动浏览器请求将 Vault API 隔离为 401，真实书库不读取也不写入 | WebKit/Chromium 真实 Cloudflare 候选入口及实体 iPhone（5 条目录项）均通过 |
| WP3-05 | 浏览器继续使用独立候选路径 | 正式 `/v4-directory/` 仍为 `v4-261014-0816` | 不自动提升、无正式发布 | HTTP 验证已通过 |
| WP3-06 | 在 iPhone 从候选页进行升级后重新加载 | 应同时看到新版标牌、导航与 AG 表，`ready/mounted` 后才认定升级成功 | 尚未安排候选内部下一次构建；需先取得 WP3 真机首开验收 | `manual-external` 未验收，WP3 下一阶段 |

## 已执行自动测试

1. `node ui-spikes/v4-directory/tests/wp2UpgradeGate.mjs`：WebKit 4 项、Chromium 2 项共 6/6 PASS，真实 WCP+插件容器、AG 表、草稿阻拦、loader/chunk 故障恢复和半发布拒绝。
2. `node ui-spikes/v4-directory/scripts/release-wp3-candidate.mjs`：候选发布独立目录；本机 4176 与公网 `ocr2md.laity.bid` 均核对 HTML/manifest 以及 8 个 manifest 文件哈希，输出 `WP3_PUBLIC_CANDIDATE_RELEASE_PASS`。
3. `node ui-spikes/v4-directory/tests/wp3PublicCandidateBrowser.mjs`：真实公网 HTML、真实 WCP Loader 和真实插件注册表、真实 CSS/JS，WebKit 与 Chromium、iPhone 390px 均 `phase=ready`、AG 网格可见、三个标签可见、横向无溢出；无控制台 JS 异常、无额外失败请求。只有**测试主动注入**的 Vault 401（只读隔离）属于预期。
4. WP3 实体 iPhone Safari 首次打开：**已通过**（用户于 2026-10-14 09:45 提供两张实机截图，顶栏 `v4-261014-0916`、工作目录 AG 表加载 5 项，版本弹窗显示 `启动诊断：v4-261014-0916 / ready / mounted`；外网 iPhone 5G）。这证明真机首开/挂载，**不等于候选自动升级已验证**。

## 真机验收步骤（用户）

从外网 iPhone Safari 打开 `https://ocr2md.laity.bid/v4-wp3-candidate/`。先检查能否看到工作目录 AG 表和顶栏 `v4-261014-0916`，点击该版本标牌确认启动诊断显示 `ready / mounted`。若显示启动错误，可直接截图错误代码和资源域名，不需要提交任何书籍、密钥或完整 URL。**本轮不要操作真实保存、发布。** 将实际页面是否显示正常及版本弹窗状态报告回来后，才能继续候选版中的自动升级演练，不可跳过。

## 退出/回退

正式入口从未被切换，用户随时返回 `https://ocr2md.laity.bid/v4-directory/` 使用 0816。候选目录是独立静态快照，出现错误可以停止使用，不需要回滚正式版。WP4 的自动正式发布机制必须以 WP3 真实 iPhone 结果为前提。

## 2026-10-14 09:45 实机反馈

截图 1：5G iPhone Safari，顶栏 `v4-261014-0916`，工作目录 AG 表 5 行（含多个目录和文件），框架状态已加载 5 项。截图 2：版本弹窗 `启动诊断：v4-261014-0916 / ready / mounted`，WCP 0.1.7、TriPane 0.2.1 与各业务模块正常列举。因此 WP3-01、WP3-02、WP3-04 实机通过。尚未对候选路径进行 0916→下一版本的无手动刷新升级验收；WP3-06 仍待执行。

## 2026-10-14 · 独立候选自动升级演练 0916 → 0948

- 实体 iPhone 已确认 0916 首开和 WCP `ready / mounted`、目录 5 项。后续依照用户启动 WP3/4 的目标，部署一次**只有构建 ID 与缓存键变化**的 0948；不增加业务变更、不改正式 `v4-directory/`。
- 新构建：`v4-261014-0948`（2026-10-14 09:48:31 UTC+08）。部署前根据 SHA 比较只有 `index.html`、`app.js` 变化；两者归一化版本号/时间后字节一致，插件 bundle 与 CSS 全部不变。
- `scripts/release-wp3-candidate.mjs --upgrade` 仅升级独立路径。发布前使用 `WP2_STABLE=.../v4-wp3-candidate` 和最新源码做 **6/6 完整升级测试**（WebKit / Chromium + Loader 故障恢复 + 半发布拦截）。通过后双重 rename 新旧目录、保留旧 `0916` 完整回退快照；公网与本机逐项校验构建清单/HTML 和 8 个 SHA 文件。输出 `WP3_PUBLIC_CANDIDATE_RELEASE_PASS`。
- 旧版保留：`ui-spikes/v2/.v4-wp3-previous-v4-261014-0916-e4accd5c-f07f-4516-a0bf-631c672f417f`，不得在真机验收前删除。
- 新候选公网打开独立验收：`WP3_EXPECTED_VERSION=v4-261014-0948 node ui-spikes/v4-directory/tests/wp3PublicCandidateBrowser.mjs`，WebKit 与 Chromium **2/2 成功**：`ready / mounted`、工作目录 AG 网格、3 个 tab，390px 不溢出，只有测试隔离的 Vault 401，无 JS 异常或意外网络失败。
- **待用户最终审核**：让真实 iPhone **切回原先打开的 0916 标签页，不手动刷新**，观察是否自动变为 0948，同时仍能加载目录并在版本弹窗显示 `ready / mounted`。如失败，先保留屏幕证据，立即把候选目录回退到上列 0916 快照；正式公网从未修改。

## 2026-10-14 10:37 · iPhone 自动升级真实失败样例（WP3-06 未通过）

- 用户在 iPhone 5G 的原候选标签页进行 0916 → 0948 自动升级后截图：顶栏 `v4-261014-0948`、框架状态 `已加载 5 项`，目录面板 AG 表保留表头，但 5 条目录行**全部不可见**；右侧源码预览的默认提示仍在。不能仅凭启动 `ready` 或 API 返回 5 项声明完整成功。
- **真机结论**：自动导航和目录请求在一定程度上完成，但 AG 可见内容未恢复。WP3-06 判定 **FAIL / 待定位**；不能升级正式入口。稳定正式版继续 `v4-261014-0816`，独立候选当前 `0948`，0916 完整回退目录仍保留。
- 新增自动化 `tests/wp3DirectoryRowsUpgradeBrowser.mjs`：以保存的 0916 和现有 0948 原始运行文件，真实 WCP + 实际 AG Grid + 5 项**合成数据**模拟受保护书库的只读 GET（无用户数据或凭证），让 WebKit 与 Chromium 经相同自动导航升级，严格断言升级前后 `[data-testid=workspace-ag] .workspace-entry` 恰为 5 行且文字未变。两引擎均 PASS，说明正常模拟环境无法复现真机的不可见行问题；不能据此推翻实体 iPhone 失败。
- 关键代码路径：`plugins/workspace/workspace.js` 的 `go()` 调用 `grid.setRows(result.entries)`，然后通过 `output('已加载 '+result.entries.length+' 项')` 改变顶部状态。`plugins/workspace/workspace-grid.ts` 调用 AG Grid `setGridOption('rowData',rows)`；**状态文案反映数据响应的条数，不包含实际渲染行数的验收**。此外工作目录通过 WCP ResidentHost/TriPane 先创建后显示，需调查 iOS Safari 的布局可见性/生命周期。
- 之后应在隔离候选版加入轻量、非敏感的 `result.entries.length` 与 AG Grid API `getDisplayedRowCount()`/DOM 可见行数对照、视图尺寸和连接状态，避免再次把数据条数当作渲染成功。用户可先点击现有页面内「刷新目录」以区分是否是一次性的布局/网格渲染失步；不要强制整页刷新、不要进行书库写入。
- **禁止**：在 WP3-06 失败且未经实机复验前发布正式 `v4-directory/` 或自动晋级 WP4。后续改动必须先增加完整 5 行呈现的可视 UIC 回归场景。

## 2026-10-14 11:44 · Full 模式实机复核

用户截图：`0948`、已加载 5 项，Full 模式下（按钮已显示 Compact 模式）AG 表头仍存在但全部目录行不可见。故调节 TriPane 布局不足以恢复，不能仅凭 resize 断定根因。新增候选源码中的 AG 模型/筛选/渲染/DOM 计数对照和不刷新页面的网格重绘按钮；**尚未部署**，须先完成独立测试并避免覆盖稳定版。

## 2026-10-14 11:48 · iPhone Full 模式仍空行后的只读诊断版本

- 用户 11:44 截图：iPhone 5G `v4-261014-0948`，顶部 `已加载 5 项`；切换 TriPane 至 Full 模式（按钮变成 `Compact 模式`）后，AG 有列头、无目录行，右侧源码正常。确认单纯切换布局无法恢复，WP3-06 继续失败。
- 本轮未改变 V4 文件服务及章节逻辑。`plugins/workspace/workspace-grid.ts` 采用 AG Grid 公共 API `forEachNode`、`getDisplayedRowCount`、`getRenderedNodes`、`isAnyFilterPresent` 和 `.workspace-entry` DOM/交集矩形，采集**仅数字**的模型、筛选后、渲染、DOM、可见行和容器宽高，无姓名、文件内容、密钥、路径上传。
- `plugins/workspace/workspace.js` 在每次 `workspace.list` 成功后延时 350ms 检查，不再将“API 返回 5 项”误当成渲染通过。当前诊断 canary 常显数值；若模型/显示/渲染/可见行数异常，显示不触碰 Vault 的「重绘表格」按钮，执行 AG Grid API `redrawRows/resetRowHeights/refreshCells`，而非整页刷新。此诊断界面只用于 WP3 定位，正式稳定版不受影响。
- 首次诊断构建 `v4-261014-1148`，与上一 candidate `0948` 的运行差异仅 `app.js/index.html` 版本标牌和 `plugins/workspace/workspace.js` + `plugins/workspace/workspace-grid.js` 的诊断变化。发布脚本 `--upgrade --diagnostic` 逐个比对全量运行文件并对白名单之外的变化 fail-closed，保留旧目录，官方正式 `/v4-directory/` 未修改。
- 已验收：合成 5 行、真实 WCP/AG、旧 0948 → 新 1148 的 WebKit/Chromium 2/2 通过，数值均为 模型5/筛后5/渲染5/DOM5/可见5；正式 WP2 升级门禁 6/6，通过公网真实 WebKit/Chromium 1148 启动 2/2；Cloudflare 及本机的 8 个 manifest 哈希均一致。旧候选回退快照：`ui-spikes/v2/.v4-wp3-previous-v4-261014-0948-e6e097ab-b138-48ae-a4fc-74c47ca7d854`。
- **待实体 iPhone**：切回原候选标签，观察 0948→1148 更新后五行是否显示。特别记录“AG 模型 / 筛后 / 渲染 / DOM / 可见”和“筛选开/关”。如果仍 0 行但 `AG 模型 5`，再点击页面提示的「重绘表格」，查看是否恢复。真实 iPhone 结果未收到前不能宣称修好，不进入 WP4。

## 2026-10-14 11:58 · 重绘无效后的行坐标诊断 1158

- 用户反馈：在诊断版本 `v4-261014-1148` 点击页面内「重绘表格」后，5 项目录**仍然没有出现**。WP3-06 继续 FAIL。`AG 模型 5 / 筛后 5 / 渲染 5 / DOM 5 / 可见 0` 的实机数据先前已确认；单纯 `redrawRows/resetRowHeights/refreshCells` 不解决问题。
- 新版 `v4-261014-1158` 仅在工作目录组件增添首个 AG 行按钮和所属 `.ag-row` 相对于 AG 容器的四维坐标、AG 视口坐标和滚动尺寸、可见性与 opacity 数字；绝不读取或上传文件名、用户输入和密钥。**不要将诊断成功视作实机修复**。
- 实际源码只有 `plugins/workspace/workspace-grid.ts` 和 `plugins/workspace/workspace.js` 两个组件修改。部署前以白名单对比构建包，入口 HTML/JS 只变了构建号与时间；其他业务插件不改。
- 本机隔离的真实 WCP、AG、合成 5 行旧 1148→新 1158 自动升级 WebKit/Chromium 2/2：行完整显示。正常坐标样例：首行按钮相对容器 `17,43,158,37`；行容器 `1,42,775,40`。无姓名路径泄露。
- 候选 `release-wp3-candidate.mjs --upgrade --diagnostic`：升级和故障门禁 6/6 PASS，本机+Cloudflare 8 个 manifest 文件 SHA 通过。公网独立候选 `/v4-wp3-candidate/` 当前 `v4-261014-1158`，正式 `/v4-directory/` 仍为 `v4-261014-0816`。前一个候选的完整回退位置：`ui-spikes/v2/.v4-wp3-previous-v4-261014-1148-50614d92-f05d-4954-ba57-81de802d0e6c`。
- 下一步唯一待验实机项目：无需手动刷新，切回原候选 iPhone 标签，让 1148→1158 自动升级，然后截图诊断的「行按钮 / 行容器 / 滚动视口 / 样式」数值。此前 Safari 截图无法确认坐标真正在哪；没有这组数据不能归因于滚动、裁剪、偏移或 CSS。

## 2026-10-14 12:35 · 实机定位证据与下一修复假设

- 用户提供 `v4-261014-1158` 真机 iPhone 5G 截图：AG 5/5/5/5，`可见 0`，容器 `171×311`，首个行按钮相对网格 `17,551,158,37`，所属行 `1,550,775,40`，滚动位置 `0`，API 范围 `0..268`，按钮/行样式都为 `visible/1`。**第一行 y≈550 已超出整个网格 311px 高**。这不是源数据丢失、筛选、透明度或普通重绘能解决的问题。
- 代码审计发现工作目录新建时先 `new TriPane`、`new WorkspaceView`（内部立即调用 `createGrid`），最后才 `showResident(host)`。ResidentHost 默认将内容放在文档 body 的屏幕外位置，使用固宽 1032 / 固高 700；移动到手机真实容器后会发生明显尺寸变化。这是可能的 AG 初始测量/缓存失步风险。修复首选调整创建顺序为先 `resident.show` 到实际 WCP mount 节点，后创建 TriPane 和 AG Grid，避免笼统重新渲染整页。
- AG Grid 官方 `suppressRowTransform:true`（改用 CSS top）在独立 WebKit 升级测试首次出现 `DOM 5 / 可见 0`，重跑又通过，存在不稳定性；**不应将此单独定位模式替代作为最终修复，也不应将它发布**。优先修正 ResidentHost 初始挂载顺序，并新增「AG 创建时容器宽度 vs 实际显示宽度」验收。真实原因仍需 iPhone 新版截图进一步确认。

## 2026-10-14 WP3-07 · 可见宿主先于 AG Grid 创建

操作：工作目录视图初始装载或自动升级后重新装载。需要：ResidentHost 先挂到真实可见的 WCP 容器，再创建 TriPane、AG Grid；不再于默认屏幕外 1032×700 驻留容器中初始化 Grid。效果：AG 首行稳定在表头下面，可见 5 行；旧版的常驻跨模块行为不变。测试：真实 WCP+AG、模拟 5 行数据、WebKit/Chromium 自动升级后均验证首行距 Grid 顶端约 43px、五行可见、AG 初建宽与当前容器宽一致。初始监测增加有限次数的延迟复查，避免过渡期 DOM 误判。正式 0816 保持不变。构建候选 v4-261014-1242 仅在源码、本机验证，没有发布。独立候选仍为 1158；实体 iPhone 待审核。本轮候选发布执行请求受安全检查拦截，未尝试绕过。


## WP3-07 · 2026-10-14 13:44 候选公网发布成功，iPhone 实机待验

- 本次构建 `v4-261014-1344`。第一轮从 1158→1242 的候选发布脚本能运行，但因新增的 WebKit 第一行坐标严格门禁捕捉到一次 `y=220` (正常约43) 而拒绝发布；证明旧验证只看 Grid ready/DOM 条数不足以可靠放行。
- 后续在工作目录组件中**优先显示真实 WCP/ResidentHost 容器再创建 AG Grid**；并显式从 AG Grid Community 已安装版本加载其官方结构 CSS（`plugins/workspace/ag-grid-base.min.css`，210669 字节），加载成功后创建 Grid，避免动态主题样式尚未就绪的异常。诊断增加有限时序重新核对与初建容器宽度。新增静态 CSS 不改变用户书库或其他组件接口。
- `scripts/release-wp3-candidate.mjs --upgrade --diagnostic` 明确检查差异白名单，完整升级/断线恢复/半发布 6/6；另外必须通过 `wp3DirectoryRowsUpgradeBrowser.mjs` WebKit、Chromium 基于真实 WCP、AG Grid 和合成 5 条只读目录的自动升级，以及升级后**首行真实 y=35..100、5 行可见**。在本次实测中两引擎最后都为 y=43、visible=5，发布成功。
- 候选公网 `https://ocr2md.laity.bid/v4-wp3-candidate/` 已提供 `1344`；公网 HTML、构建清单和 8 份资源 SHA 校验，外加 AG 官方结构 CSS HTTP 200 / 210669 字节。WebKit、Chromium 直接访问真实 Cloudflare 候选 URL，WCP `ready / mounted`、AG Grid、导航和 390px 布局均通过（Vault API 为测试主动隔离 401，未改书库）。正式公网 `v4-directory/` 确认为 `0816`。
- 旧 1158 候选快照：`ui-spikes/v2/.v4-wp3-previous-v4-261014-1158-fce1ceb6-7d30-4381-8c1c-5f5472f8cd4a`，禁止先于真机验收删除。**实体 iPhone 从原 1158 标签自动跳到 1344 后 5 行是否恢复仍待用户确认**。此时 WP3-07 不能宣称人工通过，WP4 继续冻结。


## 2026-10-14 13:52 · iPhone 自动升级至 1344 五项恢复（真实验收）

- 用户截图：iPhone 5G，自动升至 `v4-261014-1344`，`已加载 5 项`。AG 模型/筛选后/渲染/DOM/可见均为 5，第一行坐标相对 AG 容器 y=43；初始宽 170 与当前宽 170 一致。`2022`、`Buffett’s Alpha`、`The Corporate Life`、`忏悔录`、`v3-mac-real-vault...` 共 5 行实际出现在手机屏幕。**WP3-06 的核心自动升级/数据展示验收通过**。
- 截图还显示 AG 表头及数据区为白底黑字，和 OCR2MD 全局深色样式不一致。归因于额外装载的 AG Grid Community 结构样式中的兼容性亮色默认变量，不能直接移除该结构样式，否则可能重现 AG 行偏移。
- `plugins/workspace/workspace.js` 对工作目录 AG 独立作用域补齐深色 CSS 自定义变量，保留官方结构 CSS；AG Grid 表头在偶发 WebKit 加载次序下出现不正确的 218px 高度，将工作目录 `.ag-header` 限定为已有 `headerHeight=40` 的合同高度。数据视图运行正常时折叠诊断长栏，异常时显示计数与不刷新重绘按钮。
- 本轮产生 `v4-261014-1400`，从 `1344` 自动升级的完整 WP2 6/6，WebKit/Chromium 合成五行升级 2/2：首行 y≈43、5 行可见、AG root 背景 RGB(29,39,50)，文字 RGB(219,229,240)、成功诊断区隐藏。新增了暗色断言及 AG 表头 40px 检查。
- `release-wp3-candidate.mjs --upgrade --diagnostic` 已在已有 Cloudflare / 4176 服务成功发布独立公网 `v4-wp3-candidate/` 1400；旧 `1344` 保留完整回退目录；正式 `v4-directory/` 继续为 0816，未修改 Vault / V3、未重启服务。
- **尚待 iPhone 最终验收**：真机自动 `1344 → 1400` 后五行仍全部显示、AG 重获全局深色主题、成功诊断区隐藏。WP4 不能仅凭自动 WebKit 通过而自动晋级。

## 2026-10-14 14:41 · WP3/4 外网 iPhone 最终验收通过

- 用户提供外网 iPhone Safari 实机截图：顶栏 `v4-261014-1400`，状态 `已加载 5 项`，工作目录 AG 表明确可见五行（2022、Buffett’s Alpha、The Corporate Life、忏悔录、v3-mac-real-vault 文件）；布局、列标题正常。
- AG Grid 已恢复深色背景与浅色文字，成功状态下先前用于定位的长诊断区域不再显示；不再出现 DOM 5 / 可见 0 的异常。此截图与此前 1344 五行实机恢复、1400 WebKit/Chromium 自动升级 + 行坐标、主题验证相互印证。
- WP3 的真实外网 iPhone 候选升级、完整页面挂载及深色样式要求均 **PASS**。WP4 尚未启动；正式公网 `/v4-directory/` 的版本保持 `v4-261014-0816`，独立候选 `/v4-wp3-candidate/` 是 `v4-261014-1400`，切勿把候选版本的实机通过等同于已发布正式版。
- WP4 前置要求：保留未保存状态禁止刷新、完整 WCP 组件/AG 可见行和深色 UI 门禁、候选先于正式、原子正式切换与回退快照、绝不自动覆盖真实书库。
