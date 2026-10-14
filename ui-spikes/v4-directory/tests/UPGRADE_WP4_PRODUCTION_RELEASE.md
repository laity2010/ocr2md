# OCR2MD v4 · WP4/4 公网正式发布契约与验收

2026-10-14，基线：正式 `/v4-directory/` = 0816，已由外网 iPhone 真实验收候选 `/v4-wp3-candidate/` = 1400。用户发起「启动 WP4/4」授权将**这一份**经实机确认的候选晋级，而不是重新构建/重命名其他版本。

## Feature Contract（操作 / 需要 / 效果）

- **操作**：发布操作者执行 `node ui-spikes/v4-directory/scripts/release-production.mjs --approve-build=v4-261014-1400`。
- **需要**：明确审批的版本字符串与候选清单一致且高于正式版；候选完整运行时文件库存量及全部 SHA 经检验；4176 原站与 Cloudflare 公网的正式、候选版本与本机一致；真实 WCP Loader、插件注册表、AG Grid 的升级/失败恢复、草稿保护、完整 5 行可见位置和深色主题自动回归通过；发布前没有并发版本变更。
- **效果**：不重新构建任何业务模块，完整复制已在物理 iPhone 验收的候选快照到临时 staging，保存完整正式旧版到独立回退目录；原子目录交换后验证本机 4176、公网 HTML、8 个 manifest SHA 和 AG 官方结构 CSS。新正式版仍使用固定 `/v4-directory/`，旧页面通过已有约 60 秒的可见页检测 / `visibilitychange` 自动发现更新；未保存草稿时页面禁止重载。
- **不变量**：候选目录保持可用，永不修改用户 Obsidian Vault / DIRjson / MD / PDF；不重启 4176、Cloudflare 或 WCP；不修改旧 v3；不执行 git reset/clean/rebase/force push；任何门禁失败**不切换正式版**；切换后任何公网资源验证失败立即恢复完整 0816 目录（保留失败快照）。用户未在本会话批准的新版本不得无提示自动晋升正式版。

## UI Interaction Contract（UIC）

| UIC | 初始状态 / 操作 | 预期效果 | 副作用 / 安全不变量 | 等级 |
|---|---|---|---|---|
| WP4-01 | 正式0816、候选1400、执行版本参数化审批 | 只有参数严格匹配候选且为新版本才可发布 | 不读用户密码、不采集书籍内容 | CLI + HTTP 实测 |
| WP4-02 | 候选与正式不同版本；完整浏览器升级测试 | WebKit 和 Chromium 均可从 0816 自动升级到 1400，WCP ready、AG 真实挂载 | 页面中的 Vault API 被测试独立隔离；不发写操作 | 自动化 `wp2UpgradeGate.mjs` |
| WP4-03 | 5 行模拟目录 + 正式0816→1400；已显示旧数据、触发升级 | 新版工作目录真实可见 5 行、首行 y≈43、深色主题正常，成功诊断区隐藏 | 路径、文件名仅在本机测试合成；不会访问真实书库 | 自动化 `wp3DirectoryRowsUpgradeBrowser.mjs` |
| WP4-04 | 旧页含 dirty 标记 / 有新版本，或远程 Loader/插件故障 | dirty 禁止 reload；错误可见、可重试；混合 HTML/JS 不晋级 | 不会静默丢失当前草稿；无后台静默更新 | 自动化 `wp2UpgradeGate.mjs` |
| WP4-05 | 经过测试的 staging 晋级 `/v4-directory/` | 正式完整匹配候选 1400，旧0816的文件夹完整保留，可回退 | 只替换静态 v4 目录；不重启后端 | CLI + 内网 + Cloudflare SHA 校验 |
| WP4-06 | 真实外网 iPhone 打开/切回**正式** `/v4-directory/` | 1400 顶栏、5项目录、深色 AG、诊断隐藏；不依赖测试候选地址 | 未保存内容不自动刷新 | `manual-external` 等待用户反馈 |
| WP4-07 | 下一次有新构建 | 从业务源码构建后先独立候选自动预检，用户验收并指定 build ID 才可晋升正式版 | 禁止每次 build 自动触碰公网站点 | 构建脚本及生产发布准入规则 |

## 产物 / 运维

- 独立候选静态目录：`ui-spikes/v2/v4-wp3-candidate`，不能被正式发布的 staging/rollback 移动。
- 正式目录：`ui-spikes/v2/v4-directory`。生产发布脚本使用 `--approve-build=<精确构建ID>`；构建、发布候选与正式晋升分别是三种独立动作。
- 正式发布输出：`WP4_PRODUCTION_PROMOTION_PASS`；保留其返回的旧版备份路径用于需要时恢复。发布失败保留原版和失败快照供诊断，绝不清理历史回退点。
- 未来任何业务代码变化，必须在独立候选经功能验收后重新取得用户明确批准，不能因候选部署成功就自动晋级正式版。

## 结果

本文件最初写入时 WP4 尚未执行正式切换；之后应补充命令执行证据、HTTP 验证与外网 iPhone 结果。两者必须严格区分。

## 执行记录 · WP4 前置门禁和候选修正（2026-10-14）

1. 为正式晋级新增 `scripts/release-production.mjs --approve-build=<精确版本>`，全量 144 个候选运行文件逐项哈希验证、完成 JS/CSS 清单验证、在临时 `/v4-directory` staging 执行 Chromium/WebKit 标牌检查、旧正式版→新候选 WCP 升级门禁、模拟五行目录可见/深色测试、未保存草稿守卫；首次发布前要求明确实机已确认的构建号，发布时保留完整旧版快照并验证 Cloudflare 公网。未来新构建不允许绕过用户审批直接晋升。
2. 首次对已验收的 1400 执行 `--approve-build=v4-261014-1400`，**成功通过 6/6 WCP/故障门禁，但 0816→1400 的 WebKit 专项测试曾出现 y=220（应为约43）**，脚本报 `WP4_RELEASE_GATE_FAILED`，在替换目录之前即停止。正式入口仍为 0816。此为有效风险发现，不应降低断言或在未修复前强行晋升。
3. 故障复现查明：不是 header 本身，而是无实际 pinned rows 的 `.ag-grid-pinned-top-rows` 在 WebKit 被间歇性撑到 218px，迫使 `.ag-grid-scrolling-rows` 从 y=219 开始。仅在工作目录 AG Grid 范围对无 `.ag-row` 的该空白置顶区指定 40px flex/高度（其他 AG 组件、实际有置顶行的情况不改）；新增**故障注入**：在浏览器里主动把空白置顶容器 inline height/flex-basis/min-height 设置 218px，要求 CSS 最终仍为40px且第一行约42px，否则发布禁止。
4. 修正产物 `v4-261014-1453` 在独立 `/v4-wp3-candidate/` 发布完成：WP2 6/6，WebKit/Chromium 5行可见 y=42、深色背景、正常隐藏诊断、故障注入均通过；本机 + Cloudflare 8份 SHA和 144项运行资源验证，真实公网 WebKit/Chromium 启动 `ready / mounted`。正式 `/v4-directory/` **仍为 0816**。
5. **当前 WP4 状态：部分完成，等待外网 iPhone 真实验收 1453**。用户尚未对新增修复的构建 1453 给出实体 Safari 通过信号，禁止冒称 WP4 正式发布成功或暗中晋级。取得实机认可后，按已建设的 `release-production.mjs --approve-build=v4-261014-1453` 进行最终验收和正式切换，不得在此之前触碰正式静态目录。
