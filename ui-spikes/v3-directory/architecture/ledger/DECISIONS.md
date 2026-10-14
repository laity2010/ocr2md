# V3 架构决策与待还债务

每条决策须标明日期、模块、观察证据、决定、何时重新评审。实际代码变动/测试数据见 JSONL 与 REPORT.md。

## 2026-10-12 · 模块化第一轮

- **事实**：章节定界、章节标题、媒体、表格、LaTeX 已各自有模块入口；媒体下载业务迁出 app.ts，清洗数据通过 registry 扫描。公共 AG / PDF / MD 保存接口继续复用。
- **决定**：不为追求文件数而复制 V2 AG Grid、IR、文件读写，不重做 DIRjson；先持续积累开发改动与测试耗时。
- **待评审债务**：`ui-spikes/v3-directory/src/app.ts` 仍组织多模块 UI 及状态；`ui-spikes/v3-directory/src/irWorkbenchPanel.ts` 的定界操作仍集中；V2 `calibrationGrid.ts` 存在 V3 专属分支；`chapterElementCatalog.ts` 仍集中扫描媒体/表格/公式。
- **证据级别**：历史 BO/BP 属回顾记录，测试耗时为近似；还没有后续多轮自动记录数据，**不足以指认最优拆分目标**。
- **复查触发**：某共享文件在最近 10 轮中被 >=3 个独立功能改动；或同一场景连续两轮成为最长测试；再结合具体变更原因确认，而不是单看行数。
- **边界与撤回**：新增账本是开发工具，不改变网页行为；如果维护账本耗时接近真实功能开发耗时，应简化流程，而非继续加埋点。
- **用户审核**：架构账本尚待后续实际需求的真实数据检验。

## 2026-10-12 · 媒体模块持有 AG 业务控制权（BR）

- **明确分权**：媒体模块自己声明列定义（下载状态、失败原因）、模块列顺序、逐行状态投影、按钮点击/启停及下载队列和 409 分级策略。AG Grid 实例与通用的行选择、源码/PDF 联动、文件 CAS 事务仍由工作台的基础设施持有。模块只依赖 `ChapterDocumentPort`，不导入 Workbench 类。
- **通用边界**：`V3Workbench` 保留与业务无关的 `chapter/transaction/revalidateUnchanged/refreshGrid/registerChapterGridView`；V2 `CalibrationGrid` 只提供通用列扩展和列顺序注入，不再认识 V3 下载专用列。
- **测试策略**：媒体核心队列和列视图用 `test:module:media` 独立快速验证；产品三窗和浏览器专属互动才运行 Playwright。Chromium/WebKit 的原媒体下载、409 恢复和模块切换回归仍需保留。
- **限制**：V2 原有媒体基础列（缩略图、文件名、大小）及其底层拖拽渲染暂未搬迁，避免破坏 V2；下一次若需要调整这些基列外观，再用复用渲染器的视图配置统一接口，不直接复制 V2 AG 实例。
- **后续推广**：先观察媒体模块下一轮功能是否可仅改 `chapterMedia.ts` + 独立测试。待证实后把同样 ChapterGridView 契约应用于标题/表格/LaTeX，不同时大拆所有模块。

## 2026-10-12 · 媒体 409 分级恢复（BQ）

- **问题与证据**：Mac native.log 中近期图片下载接口可见一次 HTTP 200 后跟随 HTTP 409；具体错误内容未在 HTTP access log 中暴露，不将其断言为同一用户或真正的外部编辑。旧 `chapterMedia.ts` 遇 `ESTALE/ECONFLICT` 无条件中止，尽管某些 iCloud metadata-only 版本变化时正文未改变。
- **决策**：只有在完全重新读取当前发布章节、验证文件 revision 在读取前后不变、完整 MD 字节 SHA-256 与当前无脏稿内存正文一致时，才允许更新浏览器持有的 CAS identity 继续下一张。发生 409 的图片仍记为失败，**不自动重复 POST**。正文实际修改、失去授权、目录切换、重读失败仍中止。
- **改动热点**：`src/modules/chapterMedia.ts` 自身处理重试策略，`src/workbench.ts` 需提供可信只读重新校验能力；再次验证 V3 共享 workbench 仍是功能修改热点。后续若连续需求都需要编辑 `workbench.ts`，优先抽象有条件的文件版本重验证接口，不必重构其他清洗模块。
- **验收**：Chrome + WebKit/模拟 iPad 上隔离 MD 做“成功 → HTTP404 → metadata-only 409 → 后一张成功”通过；保留发生正文不一致时中止的安全用例；Mac 端 CAS 安全烟测通过。iPad Safari 真实网页待用户复核。

