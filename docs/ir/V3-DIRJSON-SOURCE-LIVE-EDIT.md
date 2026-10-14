# V3 · DIRjson 初始化、恢复与源码窗联动 AG · FC/UIC

日期：2026-10-09。范围只限「工作台 → 章节定界」，不启动正文校对/翻译等后续工作模块。

## 决策

- **DIRjson = Document IR JSON**：不创建平行数据库，不覆盖源 PDF 或 MinerU OCR JSON；磁盘容器继续保持已发布的 `document-ir.v1.json` 命名，以维持 WP7 快照/哈希/回滚兼容。
- 第一次进入且没有已保存 DIRjson：读取 OCR JSON+PDF，初始化 DIR 工作对象和所有原 OCR 标题候选，界面标注未审核。初始内存对象不自动写 Obsidian；即使没有编辑，用户也可以点击「保存章节定界」将初始 DIRjson 建立为首个正式快照；初始化本身不会自动写盘。
- 再次进入已有快照：**先查询经后端来源 SHA 完整验证的保存版 DIRjson**，直接载入，保持原 blockId/章节定界/人工修正，不重新从 OCR 分析和重建。来源不一致或同步缺失时拒绝静默回退原 OCR；提示用户处理冲突。
- 右上 V2 CodeMirror 在章节定界模块开启编辑，切到后续模块仍保持既有只读/高级结构操作。保留 `<!-- ocr2md-ir:block=... -->` 来源锚点和 OCR block 顺序，所有编辑在事务中**完整验证成功**才替换 DIR 内存状态；失败时恢复原始合法源码，AG 不变，提示拒绝原因。
- 源码编辑允许对已有来源锚点的标题/正文进行字词插入、删除、修改；`#` / `##` 级别调整能改变 IR 的章/节边界；在已有 OCR 正文块前加 `#` 或 `##` 可提升为缺失标题；删除误判标题的 `#` 会取消章节身份但保留 OCR 正文和原始 PDF bbox。**不允许把没有来源锚点的任意新增 Markdown 行伪造为 PDF 证据**。表格、图片、公式等复杂块的源码编辑仍在后续结构清洗模块进行，不在本模块强行转换。
- CodeMirror 输入采用 220ms 短防抖合并连续按键；同期只更新内存工作对象，AG 反映标题/文本/层级，预览跟随更新；独立 Ctrl/⌘+Z、Ctrl/⌘+Shift+Z 支持最多 20 次 DIR 历史状态回滚。保存按 WP7 的 CAS + SHA 读回校验完成，禁止写入原 OCR、历史官方 MD。
- 批量粘贴不能删除、插入或重新排序任何不可变 block 注释。每次最多处理 20 个有来源的文本块，超过后提示改为分章执行；即使原始 OCR 有误也不能丢失证据。
- DIR 中 `sourceElements` 保持原始 JSON 完整可恢复；人工作出的文本修正进入 `blocks[].text` 和 `reconstruction.appliedOperations`，章节操作写入 `chapterStructure.operations`，保留状态未审核。修改不等于“已人工核准”。

## Feature contracts

**FC-DIR-LIVE-01** 首次选工作目录，原文含 PDF + OCR JSON 且无保存快照：初始化 DIRjson 内存工作对象，AG 列出全部原始标题候选，源码展示 IR→MD + 来源锚点，PDF 展示原文，不会自动生成批准或覆写真实书籍文件。

**FC-DIR-LIVE-02** 输入标题文字（增/删/改），CodeMirror 中锚点与空行不变：防抖后修改相应 DIR block.text，AG 标题文字同步，生成 MD 内容、PDF 索引仍一致；未保存前只存在内存，浏览器离开须提示草稿风险。

**FC-DIR-LIVE-03** 在已有 OCR 文本块前插入 `# ` 或 `## `：成为新的主章节或小节候选，AG 增加对应标题记录；删除已有 OCR 标题前缀则取消标题身份，AG 标题层级消失，但源文本仍有 PDF 证据。来源缺失、公式/表格等富文本禁止猜测。

**FC-DIR-LIVE-04** 任意编辑已生成块标记、打乱 blockId、跨 marker 插入非锚定内容、尝试无来源的新标题或非法特殊块：提示错误，拒绝提交到 DIR 内存，恢复最近一次合法视图。

**FC-DIR-LIVE-05** 点击保存：核验生成 MD/证据/目录树一致性、从当前 generation 执行版本化 CAS，读回确认后清空 dirty；多设备/多会话发生冲突则保留草稿，不能覆盖其他人保存的数据。

**FC-DIR-LIVE-06** 已持久化的目录再次进入：通过授权端点校验 source SHA 并直接恢复 DIRjson，不从 OCR 重建，无重复章节推断；原始 PDF/OCR 已变化时显示阻断说明。

## UIC

**UIC-DIR-LIVE-01 · browser-auto** 初始化 fixture，不写 Vault；在 CodeMirror 实际输入标题文字，观察 AG 对应标题改变，DIR 源码显示修改后的文字，同时 PDF 指向原始位置；输出未保存草稿。

**UIC-DIR-LIVE-02 · unit/browser-auto** 原标题 `## Subsection` 去掉 `## `，AG 不再显示为 H2，正文仍在，sourceEvidence 不变；Ctrl/⌘+Z 恢复标题和原 IR 章节结构。

**UIC-DIR-LIVE-03 · unit** 在锚定正文前添加 `## `，对应 block.type 变成 title 且加入章节树，AG 增加标题候选；所有源 OCR 字节可语义往返，PDF bbox 原值不变。

**UIC-DIR-LIVE-04 · unit** 破坏 block 注释、调换注释顺序、新增没有来源的独立标题、修改未支持的富媒体块 → 整批事务拒绝，内存 DIR 保留原快照。

**UIC-DIR-LIVE-05 · browser-auto** 保存/重开→直接恢复，第三会话与原文不重算；旧逻辑块、原关联审核、PDF↔MD 定位与 iPad 布局均无回退。

**UIC-DIR-LIVE-06 · manual-external** 真人使用 iPad 对照真实 `Bufett’s Alpha` 的 PDF 校正标题，确认细粒度输入、选择、撤销、章节文件名分配和系统软键盘遮挡情况；自动验收不将实际 OCR 标为校对完成。

## 检查命令

```bash
npm --prefix ui-spikes/v3-directory run test:dir:edit
npm --prefix ui-spikes/v3-directory run test:ir:ui
npm --prefix ui-spikes/v3-directory run test:ir:ui:real
npm --prefix ui-spikes/v3-directory run test:ir:persistence
npm --prefix ui-spikes/v3-directory run test:ir:chapters
npm --prefix ui-spikes/v3-directory run test:ir:markdown
npm --prefix ui-spikes/v3-directory run test:review
npm --prefix ui-spikes/v3-directory run test:bidirectional
npm --prefix ui-spikes/v3-directory run test:ui
```

## 验收结果与发布记录（2026-10-09）

- `test:dir:edit` → `DIR_SOURCE_EDIT_UNIT_PASS`：OCR 正文校正、标题文本修改、正文提升 PDF 锚定标题、误判标题降为普通文本、保持原始 OCR 可重建、禁止删除/替换来源 marker 或伪造无来源标题。
- `test:ir:chapters` → `IR_WP4_CHAPTER_UNIT_PASS`：原有 V2 章节文件分配、顺序编号、并章与结构校验无回退。
- `test:ir:markdown` → `IR_WP6_MARKDOWN_UNIT_PASS`：生成 MD 的块范围、PDF 来源证据、普通 OCR / 媒体投影保留。
- `test:ir:ui` → `IR_WP5_BROWSER_FIXTURE_PASS`：真实 CodeMirror 键入文字后 AG 同步、取消 H2 后 AG 单元格刷新、撤销将 H2 还原；PDF↔MD 定位、iPad 视口、零 Vault 自动写请求。
- `test:ir:ui:real` → `IR_WP5_REAL_BROWSER_PASS`：真实书籍 224 个块、19 个暂定章节加载，来源 SHA 不变，页面可定位且未擅自保存原书。
- `test:ir:persistence` → `IR_WP7_BROWSER_PERSISTENCE_PASS`：保存版本从 CAS 服务读回并恢复；**重新进入已保存目录时浏览器不再读取原 OCR JSON**，只继续按需读取 PDF 供预览；两会话 CAS 冲突拒绝并保留草稿。
- `test:review` → `WP7_REVIEW_CAS_UNIT_OK`；`test:bidirectional` → `WP6_BIDIRECTIONAL_INDEX_UNIT_OK`；`test:ui` → `V3_MAC_VAULT_HTTP_BROWSER_E2E_PASS`，兼容既有目录导航、文件读写与设置。
- 真实 `Bufett’s Alpha` 原 PDF、OCR JSON、旧侧车映射 SHA 完全与已知冻结基线匹配。当前无 `.ocr2md/ir-current.v1.json` 且没有 `ir-generated/` 文件夹；真实人工校阅与首次保存仍待用户操作。
- 本轮未执行 git reset/clean/rebase/force push/commit，保留全部仓库既有 WIP。
