# OCR2MD v4 · 章节定界双工作数据快速加载航路（规划）

状态：**WP0–WP6 已完成候选发布与自动验收（2026-10-15）**，实体 iPad 缓存命中与操作仍待用户审核。适用对象：当前独立 `ocr2md:chapter-boundary` 插件及其获授权的 Mac Vault IR 专用后端。基线以已在 iPad 多次通过“小标定 CAS 读回一致”的 `v4-261014-2310` 候选为准；正式版不自动升级。

## 目标与非目标

目标：**DIRjson + chapters-map 持久事实架构不变**。首次明确初始化/保存时，或旧书籍用户主动准备时，从可信 DIRjson 派生 **章节工作索引（JSON）+ 全书连续 MD**；后续进入章节定界只检查代际与缓存版本，优先读取这两份可重建数据，AG 只显示候选标题、源码窗展示整本 MD，支持原有 PDF 元素定位。平常修改独立成章、文件名、序号仍只写 `.ocr2md/chapters-map.v1.json`。

非目标：不替换 DIRjson 为 mdast/SQLite，不新增 Markdown 解析器，不重构 WCP 内核、Dockview、AG Grid、CodeMirror、PDF.js，不迁移章节清洗、不改变公开稳定版或 `chapters/` 发布语义，不改变原始 OCR/PDF。

## 事实来源和派生工作数据

1. 不可变事实：原 PDF、MinerU JSON、`.ocr2md/ir-versions/<generation>.zip` 内 DIRjson、`.ocr2md/ir-current.v1.json` 指针。不得因加载/缓存重建而改写。
2. 人工标定：`.ocr2md/chapters-map.v1.json`（旧 `ir-markings.v1.json` 只读兼容）。这是**持久人工决策**，不是缓存；继续使用现有 CAS、备份、读回一致流程。
3. 派生视图：建议由书籍授权内部目录保存 `chapter-work-cache/<generation>/<viewSchema>/chapter-index.v1.json`、`whole-book.md`、`manifest.v1.json`；具体路径在 WP1 评审后冻结。它们都可由 DIRjson 重新计算，不是第二份人工事实。
4. 优先评估复用现有 `ir-generated/versions/<generation>/` 中的单文件全书 MD（仅当实际具备全书连续投影并校验一致），不盲目再复制一份；已分章归档不能假定包含完整连续 MD。
5. 小索引中 `headings[]` 仅包含 AG 所需 H1/H2 候选、原始块 ID、顺序、页面、默认展示层级；另有 `blocks[]` 轻量定位表，为全书每个块保留 `blockId`、MD UTF-16 区间、PDF 页、来源元素 ID、必要 bbox/normalizedBBox 的精简映射（或按页独立按需索引）。**仅存 H1 不足以支持漏章定位、AG↔源码↔PDF 三窗**。
6. `manifest` 应绑定 `book`、`baseGeneration`、`viewSchema`、`projectionProfile`、索引/MD 内容 SHA、块数和可校验来源元数据。章节标定 revision **不作为基准 MD 缓存代际**；载入时按当前 `chapters-map` 动态叠加，避免每勾一次重写全书缓存。不得缓存私密访问密钥。

## 快速加载流程

```text
书籍进入（只读）
  -> 授权 Mac Vault：读取小型状态（generation、标定修订/内容、缓存可用性）
  -> 已命中且一致：加载 chapter-index（先让 AG 可交互）
                         + whole-book.md（源码窗按需/分块载入）
                         + 当前 chapters-map（独立成章叠加）
                         -> 三窗联动；全程不请求 DIRjson 正文
  -> 缺失/过期/损坏：明确降级现有 loadIrSnapshot 全量只读路径
                         -> 告知可执行“一次性准备工作数据”
                         -> 绝不未经用户明确保存/准备便写缓存
  -> 用户明确首次保存或准备：服务器在隔离 staging 生成完整视图
                         -> 校验 MD、索引的 blockId 集合、范围、SHA
                         -> 原子发布缓存；失败不改变 DIRjson/标定/旧缓存
```

既有书籍必须有“一次性准备”动作或同等清晰授权；普通打开不得隐式触发后台写入。为优化 iPad 公网链路，索引与 MD 提供受控、鉴权的只读 API（可按块/RANGE）；不得绕开 `ocr2md:filesystem` 专用服务开放隐含的任意隐藏文件写入。原有 GET 失败重试可复用，禁止自动重放 POST。

## 工作计划与门禁

| WP | 工作包 | 主要范围 / 交付 | 门禁 |
|---|---|---|---|
| WP0 | 基线量测 + UIC 冻结 | 记录真实书籍进入时的 DIRjson 传输、SHA 校验、AG 首次可操作、源码/PDF 首次可见耗时、iPad 公网/内网表现；冻结旧版功能、保护 2310 与回退路径 | 全部只读，输出基线和可自动运行的场景；现有小标定读回回归通过 |
| WP1 | 两份派生数据契约 | 冻结 index、whole-book.md、manifest 的字段、版本、映射算法、复用旧 MD 的判定；与当前 `IrMarkdownSourceRange`、`blockId` 关联 | 纯函数测试：所有块恰好一次，H1 正确，页/坐标/UTF-16 偏移、来源标记与 SHA 一致 |
| WP2 | 纯生成器（不接页面） | 复用 `generateIrWholeBookMarkdown`、旧 `ir-generated`、现有 DIRjson 投影与安全转义；生成紧凑 index 与 MD，避免建立第二套 Markdown 生成逻辑 | 隔离样本 + 真实书籍只读：同基准确定性重复生成、未支持媒体保真、字节/内存统计 |
| WP3 | Mac Vault 专用缓存服务 | 文件系统独立授权的 status/index/MD GET 与显式 prepare；staging + 完整校验 + 原子发布；缓存按 generation 保留/失效，不修改已有快照、map、章节发布 | 权限隔离、旧缓存可用、损坏/断网/并发/代际变化拒绝、无未经许可写入、旧 API 不变 |
| WP4 | chapter-boundary 插件快速路径 | 仅插件与文件服务契约接入版本检查、轻量索引/标定视图状态、AG 标题索引、连续 MD 源码和定位表；常规独立成章操作必须直接作用于小标定，**不能为勾选操作暗中加载全 DIRjson**；ResidentHost 保留实例与未保存草稿；失效自动降级 | WebKit/Chromium：首次、二次、切换回来、刷新、另一书、离线、首屏显示、AG↔MD↔PDF |
| WP5 | 编辑/保存一致性 | 仅“独立成章/编号/文件名”继续走小 map，零全量读取；**首次进入漏章补录或复杂源码编辑时才按需加载完整 DIRjson**，现有全量 CAS 保存路径暂保留，成功后使旧工作缓存失效并准备新 generation；未保存编辑只停留在浏览器 | 既有 6/6 小标定读回测试、CAS 409、不同设备冲突、撤销/重做、漏章补录、刷新持久恢复；零丢稿 |
| WP6 | 性能与候选发布验收 | 对照 WP0 记录字节数、网络请求、重算耗时、AG 首可交互、源码/PDF 定位时间；白名单发布候选，iPad 真机人工核验 | 已命中工作缓存的正常进入：完整 DIRjson **0 次正文读取**；标定保存零全量重写；真实 PDF bbox 与源码高亮一致；正式版不变、可一键回退旧路径 |

WP0/1/2 不修改在线业务路径；WP3/4/5 仅小步接入，每一步独立自动验收并有明确回退。任何门禁未通过则停在原 `loadIrSnapshot` 路径，禁止推动更大重构。

## 必须保留的交互与安全不变量

- AG 初期“只看一级标题”默认打开，首章锁定，“独立成章”只改变文件归属，**不改变原有 Markdown # 层级**。
- PDF/源码点选普通正文仍能定位并提升漏掉的章节标题，不能只缓存标题行；源码 HTML `ocr2md-ir:block` 锚点、UTF-16 ranges、真正 PDF bbox 与当前匹配。
- 没有缓存不能等于数据损坏；缓存校验不通过不可以误用旧数据，必须显式 fallback/错误状态；不能静默从源 OCR 重新导入并覆盖已存在的 IR。
- 标定副作用只触及 `chapters-map.v1.json` 及其必要备份；明确发布时才更新 `chapters/`；CACHE PREPARE 只能触及生成缓存。工作台切换与普通 GET 仍然**不写书库**。
- 复杂正文编辑/人工补录仍旧走有 CAS 的完整快照通路，暂不承诺全类编辑已转成“小 JSON”；这是另一项独立架构迁移。
- 不依赖 iCloud 的 mtime/revision 单独证明内容一致；内容 SHA 与同代 generation 约束始终存在。不要为了“首屏快”跳过提交/发布时的完整原始来源校验。
- 不碰 WCP 路由核心及其它插件；不新增 SQLite、IndexedDB 或第二套 Markdown 解析器，不更改正式稳定版。

## 现有实现锚点

- `ui-spikes/v4-directory/plugins/chapter-boundary/irWorkbenchPanel.ts`：`open()` 当前整包 `loadIrSnapshot` / `rebuild()` 当前生成全书 MD / `saveMarkings()` 已有小标定 CAS。
- `src/documentIrMarkdown.ts`：`generateIrMarkdownBundle` / `generateIrWholeBookMarkdown` / `IrMarkdownSourceRange`，应复用，不重写语义。
- `src/documentIrArchive.ts`：当前版本化生成目录与全书草稿/分章归档条件。
- `ui-spikes/v2/v3_ir_persistence.py`：`load_snapshot()` 目前完整归档校验、来源哈希、完整 IR base64 返回；`save_markings()` 小 sidecar、`materialize_version()` 生成已有版本目录、`publish_saved_chapters()` 原始可信数据发布。
- `src/v3HttpWorkspaceFs.ts` 与 `ui-spikes/v4-directory/plugins/filesystem/workspace-fs.ts`：授权读取/小型专用命令和 WCP CQE 边界。
- `ui-spikes/v4-directory/tests/CHAPTER_MARKINGS_READBACK_WP0_UIC.md`：2310 已由用户确认“多次保存 CAS 读回一致”；刷新持久恢复尚需独立验收。

**状态汇总**：上述 WP0–WP6 已执行，候选 `v4-261015-0114` 发布并通过缓存与双浏览器自动验收；正式版仍 `v4-261014-0816`。原书籍需明确执行一次准备缓存后才会命中，实体 iPad 实际加载及操作验收待用户确认。详见 `../../tests/CHAPTER_FASTLOAD_WP0_WP6_UIC.md`。
