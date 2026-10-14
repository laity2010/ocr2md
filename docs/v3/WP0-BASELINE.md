# WP0/10 — v2 Baseline & v3 Migration Gate（2026-10-08）

## 状态与范围

- 状态：只读审计及文档基线已采集；尚未进行 v3 功能迁移，也未进行 iPad 实机端到端测量。
- 仓库：/Users/daisor/AgentDock/ocr2md-codespaces-spike
- 分支：gpt/codespaces-spike
- 固定的调查起点 HEAD：86f7c5632f7eaf64092184ca34df61d55f93cfc8
- 生产入口：README 2026-10-04 确认 macOS LaunchAgent com.daisor.ocr2md -> localhost:4176 -> Python dev_server.py；公网域名 https://ocr2md.laity.bid。旧 k3s/Helm OCR2MD 生产链已退役。
- 当前 4176 进程实际参数：--workspace-root 指向 ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md，当前 project-dir 在该 iCloud/Obsidian 树内；**当前 v2 并非直接 GD API 驱动，也不能视为纯普通本地 APFS 副本。** GD 仍是 Unison 异步镜像的一端。

## 既有 WIP 快照（开始 WP0 前已存在，禁止清理/覆盖）

追踪文件修改（13 个）：
- ENGINEERING_MEMO.md
- src/mineruAnnotationAudit.test.ts
- src/mineruAuditReviewCli.ts
- src/mineruAuditReviewStore.ts
- ui-spikes/v2/dev_server.py
- ui-spikes/v2/index.html
- ui-spikes/v2/mineru_pdf_attachment.py
- ui-spikes/v2/package-lock.json
- ui-spikes/v2/package.json
- ui-spikes/v2/src/app.ts
- ui-spikes/v2/src/mineruAuditPanel.ts
- ui-spikes/v2/tests/mineruAuditAgGridSmoke.cjs
- ui-spikes/v2/tests/mineruPdfAttachmentSmoke.py

未追踪资源（7 条）：
- .tmp/
- test-results/
- ui-spikes/v2/mineru_page_compare.py
- ui-spikes/v2/mineru_pdf_page_renderer.mjs
- ui-spikes/v2/src/originalPdfPageViewer.ts
- ui-spikes/v2/tests/mineruPageComparisonBrowser.cjs
- ui-spikes/v2/tests/mineruPageComparisonSmoke.py

已有 13 个追踪修改和 7 条未追踪资源，共 20 条既有 WIP；不要对它们执行 reset/clean/rebase/force push。历史测试生成物不代表可以删除。

## 现存模块与物理 IO 依赖表

| 功能 | 当前入口 | 实际 IO / 耦合 | WP 处理 |
| --- | --- | --- | --- |
| 文件存储通用契约 | src/workspaceStorage.ts | 已有 WorkspaceStorage 接口，含读写、目录、重命名和 stat | WP1 扩展复用，不另起冲突接口 |
| 既有 Adapter | src/vscodeWorkspaceStorage.ts；src/googleDriveWorkspaceStorage.ts | VS Code 与 GD 适配已存在，但 v2 生产目录没有使用它们 | WP1 兼容对照，WP3 新增 Mac Local |
| GD API | src/googleDriveApiGateway.ts | 独立于 v2 当前 macOS 原生目录后端 | 保留，无需 WP0 改动 |
| 目录 UI | ui-spikes/v2/src/app.ts loadWorkspaceDirectory()/switchWorkspaceDirectory() | 每次 GET no-store；切换 POST 后 window.location.reload() | WP2 提取 DirectoryController；减少整页重载 |
| 目录后端 | ui-spikes/v2/dev_server.py workspace_directory_payload() | Path.iterdir + 子目录 is_dir/is_dir(chapters)；无目录索引缓存 | WP2 独立 DirectoryService/Adapter |
| 工作区切换 | dev_server.py switch_workspace_directory() | 用新 ChapterProjectStore 替换全局 project_store 并存储 selection | WP2 事务化切换 + 事件；保留保存守卫 |
| 章节列表/读写 | ui-spikes/v2/src/chapterRepository.ts、persistentChapterRepository.ts；dev_server.py ChapterProjectStore | 业务 Repository 在 TS 已抽象；Python 具体逻辑还直接使用 Path 与 project_dir | WP4 逐个 IO 适配 |
| 章节保存/冲突 | dev_server.py ChapterProjectStore.save | expectedRevision 与当前 working+sidecar 校验，临时文件 + os.replace 及异常回滚 | 保留现有防覆盖；WP1 规范组提交崩溃恢复 |
| 注释/PDF 页面映射 | ui-spikes/v2/mineru_pdf_attachment.py、mineru_page_compare.py | 根据当前项目根目录找 PDF，依赖磁盘具体布局 | WP4 从 Workspace FS 获取文件定位 |
| PDF | ui-spikes/v2/src/originalPdfPageViewer.ts；dev_server.py；mineru_pdf_page_renderer.mjs | 4176 服务端 PDFium 常驻 Worker，PDF.js 兜底；整本 PDF 读取到服务端内存；单 Worker 串行；64 页 LRU 缓存；页面 JPEG + 预取 | WP4 解耦文件来源；WP5/6 测高频跳页、缓存及移动端渲染 |
| 同步 | README.md、deploy/native/run-ocr2md、外部 Syncbar/Unison | Obsidian <-> iCloud <-> Unison <-> GD；独立系统，不是当前 v2 HTTP 业务请求的一部分 | WP9 只做适配与冲突验证，不在 WP0 改动 |

现有回归入口：ui-spikes/v2/tests/workspaceDirectoryNavigation.spec.ts、persistenceConflict.spec.ts、mineruPdfAttachmentSmoke.py、src/googleDriveWorkspaceStorage.test.ts、src/workspaceStorage.test.ts。涉及真实 UI 改动须继续遵守 AGENTS.md 的 Feature Contract/UIC、npm run test:all 与人工审核原则。

## 2026-10-08 只读性能基线（Mac 侧）

**环境**：同一 Mac 上运行的 v2 生产端口 4176，当前 iCloud/Obsidian 工作区；单机 Python urllib 标准库，GET 不进行保存/切换。目录 GET 每组 8 次，P95 采用本组最高值（8 样本最近阶百分位），数据量有限，非统计 SLA。首轮 API 初始化后采样。

| 请求 | n | 响应数据 | min | P50 | P95 / max |
| --- | ---: | ---: | ---: | ---: | ---: |
| 本机 127.0.0.1:4176 /__workspace/directories?path= | 8 | 923B、6 个子目录 | 3.65ms | 3.81ms | 7.05ms |
| 本机 127.0.0.1:4176 /__workspace/chapters | 8 | 3393B、15 个章节条目 | 5.69ms | 6.11ms | 7.00ms |
| 本机 127.0.0.1:4176 首个子目录 | 8 | 702B | 2.88ms | 3.44ms | 7.01ms |
| iCloud Vault 根目录 Path.iterdir/is_dir | 8 | 6 个子目录 | 0.15ms | 0.19ms | 43.61ms |

PDF /__workspace/original-pdf/page?chapterId=<章节ID>&page=1：第一次请求 333.93ms，JPEG 198,853B；第二次 29.05ms，同样的数据大小。**Worker 已存在**，不是 PDF 进程/书本真正冷启动基准；包含本机 HTTP、读取响应和渲染/缓存路径，不包含 iPad 显示耗时。

公网从同一 Mac 通过正式域名（向公网出去再进入服务）访问相同目录：
- Python urllib 4 次全部 HTTP 200、923B，依次 **1746.0 / 2896.3 / 1531.7 / 1632.8ms**，P50=1689.4ms。
- 后续 curl 独立连接 3 次均 HTTP 200：total 2.055 / 4.263 / 1.736s，DNS 11～15ms，TLS 建连累计至约 522～537ms，TTFB 1.713～4.021s。该探针并非真实 iPad 网络，反映当前公网回环路径有明显额外延迟。
- 不能把响应全部归因于 Cloudflare、iCloud、浏览器或后端某一层；需在 WP2 分解中间链路和 iPad 用户操作时序。

**阶段性判断**：
1. 在本机 warm 目录接口仅约 3～7ms，不支持“目录扫描本身必定是主瓶颈”的结论。
2. 公网回环和整页 reload 可能放大体验延迟。WP2 应同步量化 API RTT、目录渲染、切换 POST、整页重新初始化的耗时。
3. 本机 PDF 首次页请求约 334ms，缓存后 29ms；尚不能评价真实 PDF 冷启动、iPad 翻页和注释审计体验。
4. 当前样本小，不代表云同步占用、极深目录、iCloud 卸载文件后的冷态或多端同时编辑。

## 可复现基准方法（读请求，不执行工作区修改）

- 本机请求：curl -sS -o /dev/null -w '%{http_code} %{time_total}\n' 'http://127.0.0.1:4176/__workspace/directories?path='
- 公网回环：curl -sS -o /dev/null -w '%{http_code} %{time_namelookup} %{time_appconnect} %{time_starttransfer} %{time_total}\n' 'https://ocr2md.laity.bid/__workspace/directories?path='
- PDF 页面：先通过 /__workspace/chapters 获取项目已有 chapterId，再 GET /__workspace/original-pdf/page?chapterId=...&page=1。使用 GET 会预热本机缓存（不修改原 PDF）；冷启动单独测试时必须在隔离服务而非生产服务完成。
- 首屏/切目录前端：暂未取得真实 iPad NavigationTiming/LCP/页面交互数据；WP2 与 WP5 需要设备桥或 Safari 远程调试测量。

## WP0 结论与下一站（WP1）

WP0 只冻结**现状与方向**，不把探索性性能目标伪称为已达标：
1. 复用 WorkspaceStorage + ChapterRepository 现有边界；先把目录与后端文件来源脱钩。
2. Storage/Sync 分开；业务文件和版本元数据同步，SQLite 派生索引和 PDF 缓存不跨设备同步。
3. WP1 先定义身份、路径、权限、错误、事务、CAS 和工作区切换事件；不先实现 SQLite 或 Native Shell。
4. WP2 在普通本地目录及模拟 Provider 下验收目录增删改移/外部变化/未保存拦截。测试必须在隔离 Fixture 中执行；禁止对真实 iCloud/Obsidian Vault 做删除改名测试。
5. 性能验收除 Mac 本机外，必须包括 iPad Web 实机、公网往返、离线重开；并单独列清缓存冷/热态。

对应技术决策：docs/v3/ADR-0001-LOCAL-FIRST-WORKSPACE.md。
