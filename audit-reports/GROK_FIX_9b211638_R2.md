# OCR2MD 9b211638 修复报告 R2（方案 A–F）

- 仓库：laity2010/ocr2md；基线 9b211638；修复分支 `fix/grok-9b211638`（起点 5871491）
- 作者：Grok Bot (OCR2MD Auditor)；时间均为 Asia/Shanghai（UTC+8），2026-10-30
- 未 push、未 rebase/reset/force；未改动冻结快照和审计包分支 `audit-public-9b211638`；没有弱化任何断言，没有加重试，也没有加长超时
- 证据目录：`/workspace/grok-evidence-9b211638/r2/`（不含 PDF、不含 token）
- 是否合并由审计主管决定

## 提交
| 提交 | 方案 | 内容 |
|---|---|---|
| 8a7e7e1 | C | 浏览器路径与 PNG→JPEG 跨平台 helper |
| 5275084 | B | 导航字号订阅登记进 AM，模块归属 N→L |
| a34c1ea | D | HMAC 会话 cookie，解锁码改为派生值 |
| 7c1ac6c | E | 412 双编辑器 CAS 测试登记进 AM；删除 labs/wcp-lab/modules/latex-module.js |
| a0b4dbc | F(1) | workspace-root 在 WebKit 下超时的根因及修复 |
| 5fec496 | F(2) | 导航点击失败时输出诊断（不重试，直接重新抛出） |
| d254536 | A | pdf-anchor 场景重建 |

## 各方案的改动与验证
**A pdf-anchor**
- 判定：不是回归，是测试前提已经过时。
- 用真实 Chromium 和 WebKit 对比：
  - 229c9a4：PDF scroller 底边 1090，窗口 1056，存在 34px 裁切；
  - HEAD：scroller 底边 1056，应用正好放进窗口。
  - 证据：A-diag-229c9a4.log、A-diag-head.log。
- 改法：测试里用 html 高度 +34px 重建 Safari 大视口下的屏幕裁切，并先断言裁切量正好是 34。
- 原有的前置断言 `scrollerBottom>windowBottom` 和 ±12px 可见性断言都原样保留。
- 结果：两个引擎都 PASS。
- 变异检查：让 visibleClip 忽略屏幕裁切后，测试 rc=1（A-mutation-ignore-screen-crop.log）。

**B 导航字号订阅**
- 改动：
  - 订阅登记为 SUB-L01，新增 TC-SUB-L01；
  - audit_boundaries 新增三类检查；
  - 单元测试 18/18 通过。
- 变异检查：
  - 模块改回 N，check 失败；
  - 去掉订阅者，测试失败。

**C 跨平台**
- 浏览器路径按以下顺序取：环境变量 → Mac 原路径（仅在存在时）→ Playwright 自带浏览器。
- PNG→JPEG：darwin 上仍调用原 sips 命令，其他平台改用 Chromium 转换。
- Mac 上的行为不变。
- 不加 preload 时 B 测试仍能通过，说明回退路径可用。

**D 会话凭据**
- 改动：
  - cookie 改为 HMAC-SHA256(KEY, 'ocr2md-v6-session-v1|v6edit')；
  - 解锁码改为 HMAC 派生值的前 12 位；
  - cookie 权限标志不变。
- 测试：
  - 新增 v6-session-secrecy：检查 12 个响应，任何响应头、cookie 和正文中都没有 KEY 的任意 12 字符片段；用 KEY[:12] 解锁返回 403；
  - save-safety 16/16 通过（原 13 项 + 新 3 项），在隔离的 /tmp 副本上用随机 token 运行。
- 变异检查：
  - cookie 改回原始 KEY，测试失败；
  - 解锁码改回 KEY[:12]，测试失败。

**E 412 草稿保护**
- 登记为 C-SAVE01 / TC-C-SAVE01（am check：apis=170）。
- 测试默认自己启动一个隔离的 Main 服务器，文档和 token 都放在 /tmp；原有 Lab 模式保留。
- 结果：Chromium 和 WebKit 都 PASS。
- 变异检查：在 412 时把文档重置，测试报 "Stale editor lost local draft" 失败。
- 已删除孤立文件 latex-module.js，wcp-runtime-contract 5/5 通过。

**F WebKit 超时**
- workspace-root：根因已证实。WebKit 不向 http://127.0.0.1 发送带 Secure 标志的 cookie，Chromium 会发送。
  - 最小探针 F-webkit-secure-cookie-probe.log：WebKit 的 cookie 存储里有这个 cookie，但页面请求时没有发出。
  - Main 服务器一直给 cookie 加 Secure，所以 WebKit 下保存未授权，界面停在“需授权”。
  - 修复：在共享 helper `adoptLoopbackSessionCookie` 中，把服务器下发的同一个值去掉 Secure 后加入测试上下文。这只改测试 harness，服务器的 cookie 标志不变。
  - 修复后两个引擎都 PASS。
- media-paste:89 和 outline-title-scale:53：失败点都在 selectModule 的点击（等待元素 stable 超时）。
  - 单独运行 6 次、在 8 核满载下运行 4 次，都没能复现。
  - 没能确认根因，也不能断定是 WebKit 的 bug。
  - 已加诊断代码：失败时采样元素位置、命中元素和动画数量，然后原样抛错，不重试。
  - 这两项在 R2 的三次门禁中都通过了。

## 门禁（gate copy /tmp/grok-fixgate-9b211638，d254536）
| 次 | 日志 | 结果 |
|---|---|---|
| 1 | gate-full.log | build、unittest、check、coverage、edges、run-all、certify、fsck 全部 rc=0；244/244，failed_suites=0，CERTIFIED |
| 2 | run-all-2.log | passed_cases=244/244，**failed_suites=1**：note-pair-browser:64 的 page.goto 超时 60s；RC=1 |
| 3 | run-all-3.log | passed_cases=244/244，**failed_suites=1**：quote-indent-browser:37 超时 75s，当时 pdfLoading=true；RC=1 |

**第一次 CERTIFIED 不代表稳定。** 连续三次中只有一次完全通过。

失败归因：
- 这两个套件在 R2 中都没有改动，被测代码路径（导航、PDF 加载）也与本轮改动无关。
- note-pair 自己写入 cookie，D 的迁移逻辑会接受它。
- 历史记录：这两个套件在原始 9b211638 门禁和此前各次运行中都是 PASS。
- 在 HEAD 上各单独运行 3 次，6/6 PASS（attr-*-solo*.log）。
- 失败现象分别是页面导航卡住和 PDF 加载过慢，与机器负载导致的偶发超时一致。
- 结论：判断为原本就存在的负载型偶发问题，没有证据表明是本轮引入的。但根因没有确认，所以没有修改。

## D 的迁移步骤与对已登录用户的影响
1. 部署新代码。默认 `V6_LEGACY_RAW_COOKIE` 未设或不为 0，即开放迁移期。
2. 已经登录的浏览器：旧 cookie（原始 KEY）仍然有效，下一次请求时服务器在同一响应里换发 HMAC cookie。用户不需要重新登录，也不会丢失编辑权限。
3. 例外：如果客户端拒收 Secure cookie（比如通过 http 访问的 WebKit），新 cookie 存不下来，浏览器会继续用旧 cookie。迁移期内仍能用，关闭迁移后就会失去授权。
4. 旧的解锁码 KEY[:12] 立即失效。需要重新解锁的用户要用新码，在本机运行 `python3 scripts/v6_auth.py` 查看。
5. `/access/<token>` 链接继续可用，但发放的是 HMAC cookie。
6. 所有设备迁移完成后设置 `V6_LEGACY_RAW_COOKIE=0`。之后仍持有旧 cookie 的浏览器会得到 403，需要重新解锁。
7. 如果 KEY 已经泄露，应更换 token 文件。更换后所有会话都会失效。

## 结论
- **SOURCE_MERGE：CONDITIONAL。** A–F 已实现，并逐项做了验证和变异检查。条件有三：第 2、3 次 run-all 各有 1 个偶发失败；F 中的两项没有确认根因；需要审计主管接受这些遗留问题。
- **PRODUCTION_CUTOVER：NOT_RECOMMENDED。** 门禁还不稳定，迁移期也还没关闭，没有在真实 iPad Safari 上验收，v6-public-save 也没有在真实服务器上跑过。

## 遗留风险
- note-pair、quote-indent、media-paste、outline-title-scale 在负载下有偶发超时，根因都没有确认。
- 迁移期内仍接受原始 KEY 作为 cookie，需要按计划关闭。
- Main 在 http 下也给 cookie 加 Secure，WebKit 在 http 下拿不到会话。这一点只在 Playwright WebKit 中验证过，真实 Safari 的行为没有验证。
- v6-public-save 需要 127.0.0.1:4397 上的真实服务器，本轮没有运行，也不在 AM 中。
- scripts/v6_ipad_chrome.mjs 里仍是写死的 Mac 路径（开发脚本）。
- A 是在测试中人为重建裁切，不等于真实 iPad 验收。
