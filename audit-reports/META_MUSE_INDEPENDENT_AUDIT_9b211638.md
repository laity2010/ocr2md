# OCR2MD V6 独立 AM/Git 审计报告（Meta Muse · Linux）

- 审计员：**Meta Muse**（独立审计；不引用另一位审计员的结论作为自己的 PASS）
- 日期：2026-10-30（Asia/Shanghai）
- 被审计冻结源码 SHA：`9b211638b1791fc0ac4b084cc565230203507d9d`
  （冻结树 `aa54240a351d98cf7ae23055451658ee1d840dfc`）
- 审计交付包：公开仓库 `laity2010/ocr2md` 分支 `audit-public-9b211638`，
  包 HEAD `f755ac947904c361d8148d6231b2fa778824a182`（父提交恰为冻结 SHA，
  diff 仅 `.gitattributes`、`AUDIT.md`、`audit.sh`、PDF 夹具 4 个交付文件）
- 平台：Ubuntu 24.04.5 LTS x86_64；git 2.43.0；node v24.22.1；npm 10.9.4；
  python 3.12.3；Playwright 1.64.1；Chrome for Testing 156；WebKit 27.2
- 夹具：PDF SHA-256 `be12aa25…e41ab`、MD `d86508f6…7d764`（audit.sh 核验通过）

## 总结论：冻结快照 9b211638 —— **FAIL**

标准入口 `bash audit.sh`（run-standard-audit.sh）退出 1：Python 边界门禁
基线漂移使 runner 在执行任何契约之前中止，标准自动判定 **FAIL**
（failures: AUDIT_RUNNER_NONZERO、AM_RESULTS_INCOMPLETE）。
审计员在同一隔离目标内按 runner 原参数手动补跑门禁之后全部阶段：
**54/57 套件、236/240 契约 PASS**，3 个失败套件均已 3/3 确定性复现并定性。
静态边界扫描零违规、edges debt=0。

## 1. 标准入口原始结果（不可改写的第一事实）

- 构建 PASS；AM 登记 **[12 模块， 167 API, 13 消息， 19 发布者， 28 订阅者， 240 用例]**；
  AM_REFERENCES_PASS（167 行 API 与全部源/测路径核验通过）。
- Python 门禁 33 项中 1 项 FAIL：`test_boundaries.GateTests.test_baseline`
  断言 `(ui_js, modules, cross_module_imports) == (48, 9, 31)`，
  实际 `(63, 12, 38)`（AssertionError 原文见证据 02）。runner 就此退出，
  coverage/edges/run-all/certify 均未执行，契约执行数 0/240。

## 2. 手动补跑（与官方失败分开记录）

同目标、同 NODE_OPTIONS 预载、同 V6_PDF_PATH，依次执行
`am.py coverage / edges debt / run-all / certify`（证据 05）：

- coverage：API 167/167 关联；消息 13（有订阅者 12）；发布者 19/19；订阅者 28/28。
- edges debt：无结果 = 0。
- run-all：`AM_UI_BOUNDARY_PASS files=63 shared=8 cross_imports=38`；
  **AM_FULL_RESULT passed_cases=236/240 failed_suites=3**。
- certify：拒绝（无完整 PASS 且源码树未变）——符合预期。

## 3. 发现

### F1（P1，确定性，测试基线漂移）——门禁常量未随登记增长更新
`tests/am/test_boundaries.py:24` 的硬编码基线 (48,9,31) 停留在提交 16fe529
时代；其后 WCP 组件抽取、HTML 元素定位、注释对等模块正规登记进入
（registry [12,167,…]、ownership.json 同步扩展），常量无人更新。
审计员在纯净源码检出上独立复扫：63/12/38 属实且 **issues=[]**——
增长全部合法、无越界；缺陷在门禁常量本身。后果是实质性的：
**该冻结快照经其自身标准流程无法取得认证**，且会掩盖其后所有契约结果。
定性：测试维护缺陷，非产品缺陷、非边界违规。

### F2（P2，确定性，测试自包含缺陷）——suite 23 依赖环境残留文件
`tests/main-promoted-lab-ui.browser.test.mjs:13` 无条件
`readFileSync('.v6/settings.json')`；干净隔离目标中该文件不存在，
3/3 以 ENOENT 在任何断言前崩溃（证据 06）。该读法仅为克隆设置并
清空 rootPath/bookName 两键（代码本身已容忍键缺失），在作者机器上
因残留文件而不可见。修复见 §6（文件缺失时回退空设置，等价全新安装）。

### F3（P2，确定性，审计适配覆盖缺口）——suite 56 WebKit 阶段授权 403
`tests/workspace-root-browser.test.mjs`：Chrome 全流程 PASS×3；
iPad-WebKit 阶段 3/3 在目录校验反馈等待处超时。仪器化定位（证据 10）：
WebKit 阶段 `/api/workspace/roots|books` 全部 **403
"Editor authorization required"**（反馈实际状态为 error/授权文案，
与第二步期望的 warning 不符而超时）。
根因链：该套件经 `context.request.post('/api/unlock')` 解锁（非 Lab
配置），服务端 Set-Cookie 带 `Secure`；WebKitGTK 在 HTTP loopback
不存 Secure Cookie；既有审计适配器（audit-loopback-cookie.mjs）的
救援只拦截**页面路由内**的 unlock POST，本套件是仅有的两个
context.request 解锁套件之一（另一个 wcp-cas 走 Lab 夹具路径不受影响），
落在救援范围之外。Chrome 因信任 loopback 而通过。
产品行为本身正确：生产 HTTPS 下 Secure Cookie 是应当的；服务端
授权校验未被绕过、未被放宽。定性：测试/审计工具链缺陷，非产品缺陷。
修复见 §6（扩展适配器覆盖 APIRequestContext 解锁路径，
仍只存储服务端真实签发的令牌值并验证落盘）。

### F4（P2，未修复，平台场景前置）——suite 39 iPad 裁切场景在 headless Linux 不成立
`tests/pdf-anchor-viewport-browser.test.mjs:72` 的场景前置断言要求
`scrollerBottom > windowBottom`（PDF 滚动区被屏幕物理裁切）。
Chrome 阶段 3/3 在此失败，实测几何（证据 09）：scrollerBottom=1056
恰等于 windowBottom=1056——headless 环境 visualViewport 与布局
视口重合，不存在 iPad Safari 工具栏造成的 ~34px 裁切。
**该断言之前的产品断言全部通过**：点击锚点（page 3 / block 6）在
异步布局稳定后仍真实可见于裁剪后的可视区内（top 1022.8 / bottom
1038.5，位于 [582, 1056] 内）。定性：测试场景的平台依赖前置，
非产品缺陷。因在本环境无法合成真实 Safari 裁切、任何强行造场景
的改法都是伪造前置条件，按 AUDIT.md「无法安全修复则保持未解决」
不修；建议主线二选一：(a) 将该前置改为在真实 iPad Safari /
macOS Safari 仿真下才强制；(b) 用 CDP/仿真手段显式构造
visualViewport 小于布局视口的几何并在测试内断言其成立后再继续。

### 观察项（非缺陷）
- **个人路径钉值的口径更正**：本审计员上轮报告（06bf498）将该问题
  仅列 media-adoption-syntax 一例；实测上轮冻结树共有 **39 个**测试
  文件钉有 `/Applications/Google Chrome.app` 路径，本轮为 **33 个**
  （迁移在推进），个人 `/Users/` 路径已清零。本轮冻结手册与 runner
  已明确将「钉路径 + 审计预载适配」定为既定机制（audit-fixture-preload
  统一改写 executablePath；本轮全部套件实跑未受影响），故按观察项
  记录并更正上轮口径，不再列为缺陷；建议主线顺手完成剩余迁移。
- `vite.config.mjs` 开发服务器 PDF 默认在未设 V6_PDF_PATH 时仍回退
  作者 iCloud 路径（existsSync 防护、仅 dev；自首轮 F1 延续的观察）。

## 4. 上轮发现复验

- **标题字号恢复（上轮 F1）**：主线以 `git am` **原样采纳**本审计员
  补丁——提交 `8f4fb48`（作者署名保留、diff 逐行一致）；配套
  `2118d15` 采纳 media 测试可移植补丁。冻结树中修复完好
  （workspace.js 记忆值 + OutlinePanel.init 补发 + 校验三处俱在）。
  suite outline-title-scale 本轮冻结与修复两次全量均双引擎 PASS
  （`persisted:1.7`，57.8px 断言通过）。
- **CM6 保存滚动（上轮 F3 观察）**：本轮两个新样本均稳定
  （冻结运行 SAVE_POSITION 121906→121906；修复运行 121929→121929），
  套件双轮 PASS；历史样本合计 1 次失败 / 6 次，未再复发，维持观察。
- **WCP/Lab 绕过面（Grok 上轮发现）**：主线已作结构性回应——
  WCP 抽取为可审计便携组件（58dc6d4）、Lab 改为 Main 镜像契约
  （AGENTS.md 第 5 条修订、c63b85b 登记 WCP 章节消息）。
  本轮标准报告的 53 个运行时调用点清单经审计员逐项分类：
  view-store.js 8 处为存储自身实现；其余全部为登记的
  `viewStore.subscribe/getState` 读路径（scroll-sync 17、main 7、
  workspace 4、outline-grid 4、各功能模块 1–3）；**跨模块
  `viewStore.setState` 为零**（唯一 `.setState(` 命中是
  wcp-cm-document.js 中 CodeMirror EditorView 自身 API）；
  `window.__v6cm6` 仅 main.js 在 `import.meta.env.DEV` 下赋值，
  生产构建不存在。未登记 DOM 字面量事件发布/订阅为零
  （标准报告 unregistered_event_sites=0）。结论：在静态扫描 +
  清单逐项核对 + 240 契约实跑的证据范围内，未发现新的绕过接口
  调用；按手册声明，动态间接调用无法穷举证明不存在。

## 5. 标准报告 REVIEW 项处置

- **115/167 API 仅有集成证据**（52 个有直接 PASS 测试）：标准报告
  的常设复核项。本轮逐项口径与 AUDIT.md 一致——集成证据不冒充
  独立 API 验证；该比例是登记规模（167）增长后的现状，作为
  REVIEW_REQUIRED 信息如实记录，不构成 FAIL 依据；建议主线
  按模块逐批补直接用例（尤其 W 开头的 WCP 组件 API）。
- **消息 E07 `activePanel` 无登记订阅者**：与上轮同类覆盖注记
  （发布方存在、订阅走 viewStore 状态读取），记录在案。
- 本轮新功能（围栏代码块、Obsidian Callout、源码行号菜单、注释对
  配对、HTML 元素定位 AG、虚拟章节集成）的套件在冻结运行中
  全部 PASS，登记与边界扫描无违规。

## 6. 修复（分支 fix/muse-9b211638，本地完整保留）

起始冻结树 `aa54240a…` → 修复树 `384570aa2c6d108f8e2803d772c0d8312195e498`，
3 个提交（format-patch 序列随本报告交付为 fix-muse-9b211638.patch，
`git am` 于 9b211638 可逐字重放）：

1. `e0cd0a4` test(am)：门禁基线 (48,9,31) → **(63,12,38)**。
   仅更新期望计数；`issues==[]` 断言与全部负向门禁测试未动。
2. `581a440` test(main)：suite 23 对缺失 `.v6/settings.json` 回退
   `{settings:{}}`。仅改设置装载，隔离逻辑与全部断言未动。
3. `467ebc7` test(am)：扩展 loopback Cookie 适配器——包装
   `browser.newContext`，对回环 `/api/unlock` 的 context.request
   POST 在真实 200 响应后，把服务端签发的 `v6edit` 值以
   非 Secure 形式存入测试上下文并校验落盘（与既有页面路由救援
   同一核验模式）。产品代码、服务端授权校验、测试断言均未动。

**修复回归（修复树 467ebc7，标准入口全量，证据 12）**：
Python 门禁 **33/33 OK**；run-all **239/240 契约、56/57 套件 PASS**；
suite 23 PASS、suite 56 双引擎 PASS（适配器日志
`api-request-unlock-token-stored` 在案）、字号套件双引擎 PASS。
唯一残留失败为 F4（suite 39 同点前置断言）——**修复树未取得
CERTIFIED，本审计员不为自己的修复签字**。
运行史如实记录：修复回归第 1 次被沙箱 EPERM 写故障中途杀灭
（07:40–09:26，结果作废）；第 2 次因上次残留 worktree 登记
exit 128 未启动；第 3 次为本节有效结果。

## 7. Git 完整性

- 审计包克隆侧 fsck rc=0；冻结检出 `git status --porcelain` 为空。
- 冻结源码全程未修改；修复仅在 fix/muse-9b211638（自冻结 SHA 线性
  3 提交，无 rebase/force）；失败证据先于修复固化（证据 01–10）。

## 8. 未验证范围

- macOS 原生运行、真实 iPad Safari（suite 39 的裁切场景只能在此类
  环境成立）、生产 HTTPS 下的 Cookie/授权行为（审计适配仅限
  loopback 测试环境）、冻结标签本轮未复核。

## 9. 结论与建议

- **冻结快照 9b211638：FAIL**（标准门禁 FAIL；补跑 236/240；
  F1–F3 为测试/工具链缺陷，F4 为未解决的平台前置；无产品缺陷、
  无边界违规被证实）。
- **SOURCE_MERGE：建议合并** fix/muse-9b211638（三项修复均为
  测试/审计工具链层面的最小修正，不动产品代码与断言强度）。
  请督导 AI 独立复跑：Python 门禁、TC-SUB-W18、TC-B01/B02，
  并确认全量下仅剩 suite 39 失败。
- **PRODUCTION_CUTOVER：NO**。冻结快照未认证；修复树 239/240
  仍非全量认证且 F4 未决；macOS/真机/生产 HTTPS 未验证。
  正规路径：合并修复 → 处理 F4 口径 → 重新冻结 → 新一轮全量认证。

## 证据清单（随报告分支交付）

01 官方 audit.sh 运行日志（exit 1）；02 标准 runner 日志（门禁失败原文）；
03/04 标准 report.json / report.md；05 手动补跑日志（236/240）；
06/07/08 冻结三失败套件日志；09 suite 39 几何取证；10 suite 56 WebKit 403 取证；
11 修复补丁序列；12 修复树标准回归日志摘录。
（交付通道说明：GitHub 连接器 push-files 只能以默认分支为基底建分支、
无 create-ref-at-SHA 工具，故 fix 分支以补丁序列交付，本地分支完整保留，
与上轮同一限制、同一处置。）
