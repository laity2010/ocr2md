# V6 Lab：新版自动刷新、直接丢弃未保存试验草稿（2026-10-26）

## 用户决定
- Lab 试验数据无需保存保护；发布新构建就应直接刷新浏览器，不等待保存、不弹未保存确认框。仅 Lab，正式主线保留完整的未保存提醒和 ETag/CAS 冲突门禁。

## 变更
- 功能提交：`40fa4fc`，只改实验分支的 `scripts/v6_lab_profile.mjs` Lab Vite adapter。主线 `ui/main.js` 和正式发布目录不修改。
- Lab 编译时将 `applyPendingUpdate` 的阻塞条件收窄到正在进行的 `saving/exporting/initializing`；取消 dirty CM6、其他文件未保存以及设置未保存阻止版本刷新；刷新后 `pendingUpdate=false`。
- Lab 编译时移除未保存内容的 `beforeunload` 原生确认弹窗。`Save` 仍为用户明确操作，授权、ETag/412 等正式数据写保护未触碰；不自动提交修改。
- 沿用既有每 5 秒 `/labs/cm-html/healthz` 版本查询和页面重新可见即检查，没有新增定时器或服务端进程。

## 验证
- 发布：`v6-lab-cm-html-20261026-213450`，位于 `https://ocr2md.laity.bid/labs/cm-html/`；正式根 `v6-20261026-102651` 未变。
- 专项：`labs/cm-html/wp0-2/lab-fast-refresh.browser.test.mjs`，在原版本构建中真实脏编辑后，模拟 healthz 提示新版本，Chrome 13.5s 内不能导航，复现原阻塞。
- 新版本地 Chrome/iPad WebKit：**PASS**。CM6 文档未保存的字节编辑触发新版本刷新后消失、零未保存弹窗、零业务 API 写入、文档重新读取。
- 新版 Cloudflare 公网 Chrome：**PASS**（Cloudflare 重载较慢，专项测试放宽网页重新可见的等待时间，没有放宽保存/刷新断言）。
- 新版 Cloudflare 公网 iPad WebKit：**PARTIAL**；浏览器的跨页重载已发生，并清除了未保存编辑，零保存提示/写入，但页面脚本记录到 `.../labs/cm-html/api/settings due to access control checks` 的跨域/请求失败错误；其余成功条件满足。该公网设置读取异常需要独立核实，不能称为公网 WebKit 全绿。
- Lab 母 Markdown SHA256 未变：`33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc`；正式 Git 主线未改变。

## 说明
- 新机制在**新 bundle 加载后**生效；已经打开且未保存的**旧版**客户端，仍由旧 JS 阻拦新版本，须用户首次手动刷新/确认一次。这是浏览器运行逻辑的边界，并非新增的强制推送能力。
- 本次为隔离 Lab 功能试验；无正式 AGENTS.md 原则修改、无主线合并。
