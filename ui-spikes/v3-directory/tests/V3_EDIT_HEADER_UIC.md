# V3 工作台右上角编辑操作 · Feature / UIC

功能 ID：FC-V3-DIR-HEADER-001
交互 ID：UIC-V3-DIR-HEADER-001
人工审核：待用户审核
自动化：browser（固定 OCR JSON/PDF fixture）；Mac Obsidian 真实数据由用户人工审核

- 操作：在章节定界或逻辑块清洗中编辑源码、补录标题或改 AG 项；查看右上角编辑区；按「撤销」「重做」「保存标定」（IR 模式为「保存 IR」）。
- 需要：已设置工作目录、DIRjson 已从 OCR 初始化或加载，持久化服务可写入时才能保存。
- 效果：当前工作台右上角和「刷新」「切换目录」同一组按钮；有待同步源码改动或 DIRjson 内容变化时「保存标定」立刻启用并突出显示；撤销/重做直接操作相同 DIRjson 状态，源码与 AG 同步。保存服务端读回成功后按钮禁用；发生冲突不得清除改动。
- 初始状态：目录或无数据时编辑按钮不可用；切换到旧版关联审核/文本块时 IR 编辑按钮隐藏；未落盘的新建 DIRjson 允许首次显式保存。
- 数据副作用：撤销/重做只改内存 IR；点击保存需要用户确认后版本化写入且 SHA-256 读回校验；不覆盖 PDF、OCR 或旧 MD。
- 不变量：不能跨目录错误修改；切换模块不丢失 DIRjson；撤销到当前已保存基线时保存按钮禁用，重做到基线时同样禁用；保留 ⌘/Ctrl+Z 快捷键；不引入自动持久化。
- 自动验证：`tests/irWorkbenchBrowser.cjs` 检查按钮位置、脏态、真实撤销与重做、源码及 AG 同步、iPad 窗口不横溢；`tests/irPersistenceBrowser.cjs` 检查保存、撤销后再启用、重做回保存版本及冲突保护。
- 人工验收：打开真实工作目录 → 修改源码或补录标题 → 右上角保存变亮 → 撤销/重做 → 保存 → 完成读回 → 刷新确认保留。

## 存档恢复防丢失 · FC-V3-DIR-RESTORE-001 / UIC-V3-DIR-RESTORE-001

- 操作：补录标题 → 保存 → 点击右上角「切换目录」→ 再选同一目录进入工作台。
- 需要：本书 `.ocr2md/ir-current.v1.json` 指向经过服务端 SHA 与来源验证的 IR 快照。
- 效果：首先查询已有快照；存在则恢复全部标题及校对内容，在界面明确提示「已恢复保存的 DIRjson」与人工补录标题数，不显示 OCR 初始化作为成功结果。只有真正不存在已保存版本时才列举 OCR JSON 进行初次初始化。
- 禁止：因为 OCR 目录慢、iCloud 目录列表失败而重做 OCR 初始化；保存版本异常不得悄悄退回旧 OCR；不能覆盖原 PDF、OCR JSON、旧 MD。
- 自动等级：browser + 真实书籍隔离副本。
- 自动验证：`tests/irPersistenceBrowser.cjs` 同标签页再次进入，并在全新会话中拦截 OCR 子目录列表为 HTTP 503，要求 0 次列表读取、仍恢复已保存标题；`tests/irSavedBookReopenReadOnly.cjs` 使用真实书籍的隔离只读副本验证恢复两次且零写入。
- 人工审核：待用户审核；看到补录标题仍存在、右上角保存按钮为禁用，状态显示「已恢复保存的 DIRjson」。

## OCR 漏录正文补录与光标稳定 · FC-V3-MANUAL-BODY-001 / UIC-V3-MANUAL-BODY-001

- 操作：行号「补录标题」→ 对照 PDF 页确认 → 在该标题下源码窗键入或粘贴多段正文。
- 需要：人工补录标题具有 PDF 页码，原 OCR 来源保持原样，支持多端 CodeMirror。
- 效果：新正文在 IR 中独立建块，`manualTexts` 附真实 PDF 页码而无虚构 OCR bbox；AG 逻辑块、全书源码同步显示；输入后光标继续处于输入位置。
- 禁止：改写 MinerU JSON、删除/伪造来源标记、误认已校对完成、光标跳到源码首行；新建非人工锚定标题不得任意凭空造 OCR 来源。
- 无效草稿：非法或暂不完整的输入应保留在 CodeMirror 中，禁止自动回滚和跳文首；显示「源码尚未同步」，阻止保存与目录切换，直到修正或用户明确按「撤销」。
- 自动级别：browser + core + isolated persistence。
- 证据：`src/dirSourceEditing.test.ts`、`tests/irWorkbenchBrowser.cjs`、`tests/irPersistenceBrowser.cjs`；人工状态：待审核。

## FC-V3-MANUAL-HEADING-DELETE / UIC-V3-MANUAL-HEADING-DELETE（待用户审核）

- 操作：在章节定界源码中点击人工补录标题的行号 →「删除补录标题」；或选中该标题文字将其清空。操作有确认，支持撤销、重做、保存。
- 需要：标题是 DIRjson 的 `manualHeadings` 记录，且不是文档最初根章节。
- 效果：删除该人工标题块及章节候选、更新阅读顺序和章节归属，AG 与源码同步；其下的人工补录正文和 PDF 页码证据仍保留并归入前一章节。
- 禁止：删除原始 OCR 标题、伪造原 PDF/OCR，静默清除正文或破坏其他人工补录块；删除未保存时不自动写磁盘。
- 自动化：core + browser；固定样例人工补录标题/正文 → 删除 → undo/redo → 持久化恢复。人工审核：待审核。

## FC-V3-IOS-CARET / UIC-V3-IOS-CARET（待用户审核）

- 操作：iPad/iPhone Safari 聚焦 V3 源码窗，输入、拖动插入光标和选择文本。
- 需要：V3 源码编辑模式，CodeMirror contenteditable=true。
- 效果：启用 iOS 原生文本光标/拖拽选区，保留既有选区与焦点恢复功能；V2 编辑器配置不变。
- 禁止：强制自绘双光标、拦截原生长按选区或破坏 Mac 键盘快捷键。
- 自动化：browser (CodeMirror 不再装载 drawSelection，检查可编辑、文本输入及选区) + manual-external (iPad/iPhone 长按和拖拽)。人工审核：待审核。

## UIC-V3-MANUAL-DELETE-CARET-001（待用户审核）

- 初始状态：在章节定界源码窗查看不是首行的人工补录标题；顶部或其他块可能仍是上一次编辑光标位置。
- 操作：点该标题的行号，执行「删除补录标题」并确认；或在源码窗直接清空标题内容/删除整个补录块。
- 预期界面：DIRjson 和 AG 删除人工标题，但源码视口留在删除发生的行附近，光标定位在原位置附近（优先删除点而不是旧光标或文件开头）；可以直接继续编辑后续内容。
- 数据副作用：原正文、PDF 页码、OCR 来源不变；删除操作仅修改草稿，按「保存标定」才持久化。
- 不变量：不能因为 `rebuild()`/`showMarkdown()` 全量替换 CodeMirror 而跳回首行；行号菜单删除必须按被删除块的 IR 来源范围定位，不依赖先前焦点。
- 自动化：`tests/irWorkbenchBrowser.cjs` 在刻意把光标留在前面其他行时删除非首行人工标题，断言删除后的光标行号与原删除行的距离不超过 2 行；保留 iPad Safari 光标体验 manual-external 验收。

## FC-V3-SAVE-CARET-001 / UIC-V3-SAVE-CARET-001 · 保存标定不丢插入光标

- 操作：在章节定界源码窗编辑正文并将光标停在某行，点击右上角「保存标定」，确认，等待 SHA 读回。
- 需要：V3 DIRjson 已建立，存在待保存更改，点击保存之前源码窗是聚焦的可编辑状态。
- 效果：保存期间阻止后续修改但不移除 `contenteditable`；保存完成后源码仍聚焦，iOS 原生蓝色光标显示在原行原偏移，视口不跳回第一行；保存按钮按已保存状态禁用。
- 禁止：保存过程丢失焦点/光标、改变选择区、重新打开源码、偷偷写原 PDF/OCR、保存期间继续修改 DIRjson。若从非源码控件触发保存，则不抢夺该控件的焦点。
- 自动化：`tests/irPersistenceBrowser.cjs` 使用真实浏览器聚焦源码后执行点击+确认+服务器校验，断言光标原位置、DOM focus、编辑模式恢复及按钮状态；iPad Safari 原生键盘/光标作为 manual-external，人工审核：待用户审核。

## FC-V3-OCR-BYLINE-TEXT-001 / UIC-V3-OCR-BYLINE-TEXT-001 · OCR 错分标题改普通文本（待用户审核）

- 初始状态：真实书籍 `Bufett’s Alpha` 既有版本的全书源码第 59 行，MinerU 将作者行误判为 `### Andrea Frazzini, David Kabiller, CFA,and Lasse Heje Pedersen`，该标题未确认章节。
- 操作：在行首依次删除三个 `#`，支持触屏软键盘 Backspace、桌面 Delete、移动端回删；不需另行定界。
- 预期界面：每删除一个 `#`，源码不复原、光标仍在 59 行附近。最终正文没有 `#`，AG 逻辑块的 `type=text`，原标题退出章节候选；撤销可恢复，每次编辑同步并激活保存按钮。
- 数据副作用：DIRjson 类型与候选结构随用户输入调整，保留来源 ID、PDF 页码和未经改写的原 OCR JSON；版本保存/重进后仍是正文。
- 不变量：任何 OCR 来源标记不得被删除；标题纠正不得重新创建 OCR 来源、清空正文、误跳到文首；禁止全量替换 CodeMirror 文档作为编辑回滚。
- 自动化：`src/dirSourceEditing.test.ts` 使用作者行固定 OCR fixture；`tests/irSavedBookReopenReadOnly.cjs` 的真实书籍隔离副本（`OCR2MD_REPRO_LINE59=1`）覆盖逐字符删除、iPad 视口 Backspace、行号与光标、零磁盘写入。iPad Safari 软键盘手势待人工审核。

## UIC-V3-IOS-TOUCH-BACKSPACE-001 · iPad 触摸标题后逐次删除 `#`

- 初始状态：真实 `Bufett’s Alpha` 全书源码第 59 行是 OCR 误分类的作者行 `### Andrea Frazzini, David Kabiller, CFA,and Lasse Heje Pedersen`。
- 操作：触摸此行，将 iOS 蓝色插入光标停在 `#` 旁边；逐次按软键盘回删，直到普通文本。
- 预期界面：源码触摸只联动 AG/PDF，**不调用 revealOffsets 改写原生编辑选区**；原生选区折叠，不会选中整条标题；每个 `#` 被删后立即保持，不再自动复原，光标继续停在第 59 行。
- 数据副作用：DIRjson 仅在有效语法时同步，最终是 `type=text` 并移出章节候选；原始 OCR JSON 与 PDF 不变。
- 安全约束：解析遇到临时非法输入时不再强行回滚用户输入；源码处于未同步状态、保存禁用且目录切换受到草稿保护；用户可继续改正或主动撤销。
- 自动验收：`tests/irSavedBookReopenReadOnly.cjs` 模拟 touchend 并断言 DOM Selection 保持 collapsed，再逐次删除 `#`、iPad 尺寸 Backspace；`tests/irWorkbenchBrowser.cjs` 验证非法输入保留及显式撤销。实机 iPad Safari 待用户审核。

## UIC-V3-IPAD-EDIT59-TOUCH-002 · iPad 软键盘编辑与 AG 反向选区（待用户审核）

- 初始状态：打开 Bufett’s Alpha 保存的 DIRjson，源码第 59 行以 OCR H3 形式显示作者行；用户从其他 AG/源码块跳到本行。
- 动作：在 iPad 源码行轻触放置折叠插入光标、连续删除 `###`；包括同一行第一个 `#` 和最后一个 `#`，测试手势型 Backspace 及短暂停顿。
- 预期：AG/PDF 联动保持，但不能在 `touchend`/`mouseup` 时反向修改源码光标与选区；每次退格之后 `#` 不应自动复原、光标不跳文首。完成后 DIRjson 真正更新为 `type=text`，并从标题候选移出，保存按钮可用。
- 非法中间态：暂时无法解析的用户源码应该留在编辑器供继续纠正，不能静默恢复旧段；期间「保存标定」禁用，Undo 可以主动放弃待同步源码。
- 缓存诊断：工作台顶部展示构建编号 `v3-touch59-20261009i`；JS 入口和 Service Worker 都采用版本化 URL，便于判断 iPad 是否仍打开旧页面。
- 自动化：`tests/irSavedBookReopenReadOnly.cjs` 设 `OCR2MD_REPRO_LINE59=1 OCR2MD_REPRO_TOUCH=1`，模拟触屏先选中别的标题再回到第 59 行，验证光标折叠且仍在 59 行，逐次删 `#`；`tests/irWorkbenchBrowser.cjs` 验证非法编辑阶段不回滚或错误保存；`tests/irPersistenceBrowser.cjs` 校验保存/恢复。
- 审核：浏览器自动测试通过；实际 iPad Safari 触摸/软键盘为 manual-external，等待用户确认。

## FC-V3-AG-H1-FILTER-001 / UIC-V3-AG-H1-FILTER-001 · AG 表只看一级标题

- **操作**：在「章节定界」AG 表上方勾选/取消「只看一级标题」。
- **需要**：已进入 V3 章节定界工作台，DIRjson 已加载；以生成的全书 Markdown 中**当前渲染为 `#`（H1）**作为筛选依据，不使用 MinerU 原始标题等级作为判断。
- **效果**：复选框默认勾选，AG 只展示 H1 标题候选；取消勾选立即恢复所有 H1/H2/H3… 标题候选，重新勾选仅展示 H1。修改章节标定、源码标题层级后自动刷新筛选；切换「逻辑块清洗（IR）」时隐藏此控件，AG 正常展示所有逻辑块，返回章节模式时沿用当前勾选值。
- **数据副作用**：无，仅 AG Grid 外部过滤显示；不修改 DIRjson、OCR、MD 源码、已选章节身份，也不触发保存标定。
- **不变量**：仅隐藏 AG 行，标题候选与原始 `this.rows` 均完整保留；源码仍展示全书，不受 AG 过滤影响；筛选不得启用保存按钮、清空草稿或重置源码光标。AG 自带列值筛选应仍可叠加。
- **固定样例**：浏览器 fixture 包含 `# A Real IR Main Title` 与 `## Research Methods`：默认 AG 仅 1 行（H1），取消勾选变 2 行，再勾选恢复 1 行；逻辑块清洗不受筛选限制；标题升/降级后 AG 跟随实时更新。
- **自动验证**：`ui-spikes/v3-directory/tests/irWorkbenchBrowser.cjs` 使用真实 AG/Grid UI；人工审核：待用户审核（iPad）。

## FC-V3-STANDALONE-FILE-001 / UIC-V3-STANDALONE-FILE-001 · 独立成章仅控制输出文件边界

- **操作**：在章节定界 AG 表「独立成章」列取消/勾选某标题；可点起始编号连续编号；可在独立标题行指定输出文件名。
- **需要**：包含多个原 Markdown 标题的 DIRjson 章节定界视图；相邻标题可以同为 `#`，也可以是其他层级。
- **效果**：取消勾选后该标题属于**前一个已勾选标题**的输出 MD 文件；如果中间连续多个不勾选，它们均与此前最近一次勾选的标题同文件。重新勾选则从当前标题位置独立开启新文件。AG「章节文件」与分组预览随之变化。
- **严格不变量**：Checkbox **不改变 Markdown `#` 等级，不把 H1 降为 H2，不修改 `IrChapter.depth`、`parentChapterId`、章节候选 status、`block.type`、OCR 或 PDF**。只有文件分组/输出文件名元数据发生变化；标题层级的修改只来自源码明确编辑。首个输出章节不可取消独立。原始正文逐块完整覆盖、顺序不变、不重复、不遗漏。Undo/Redo、保存/切换目录/重进可以恢复勾选及文件归属。
- **固定样例**：四个连续 `#` 章节 A/B/C/D，勾选 `[✓,✓,✓,✓]` 为 4 个文件；取消 B/C 后 `[✓,□,□,✓]` 成为 2 个文件，A 文件包含 A/B/C 三个 H1（均保留 `#`），D 文件仅 D；重勾 B 后为 3 个文件；所有操作前后全书连续源码逐字相同。
- **自动验证**：`src/documentIrChapters.test.ts` 测试分组/IR 不变量/源文；`ui-spikes/v3-directory/tests/irWorkbenchBrowser.cjs` 真实 AG 复选框勾选/取消及正文标题 `#` 结构；`test:ir:persistence` 保存恢复。人工审核状态：待用户审核。

## FC-V3-STANDALONE-TAP-001 / UIC-V3-STANDALONE-TAP-001 · iPad AG 独立成章复选框稳定响应

- **初始状态**：章节定界 AG 中含多条标题，默认「只看一级标题」勾选；取消一级标题过滤后 H2/H3 OCR 标题亦显示在表格；第一个可输出标题强制勾选。
- **操作**：点击同一个非首标题的「独立成章」复选框（含 H2/H3），连续勾选/取消至少 6 次，并尝试在 iPad 触摸目标上操作。
- **需要**：DIRjson 已加载，非保存/读取中的工作台、章节定界模式；存在前一个章节文件。
- **效果**：所有标题均有可用复选框，非首标题的触控目标不少于 36px；每次点击切换值与章节文件归属，AG 重绘后仍是同一个复选框节点；文件列表随状态变化而不修改 MD 标题级别。
- **例外**：首标题必须是第一个文件起点，因此锁定勾选，旁边显示锁与原因提示；不可表现为间歇性失效或空白符号「—」。
- **不变量**：复选框点击不触发 AG 行选择/焦点跳转，不因 cellRenderer `refresh` 丢失输入控件；不改变 OCR、PDF、DIRjson 章节深度，任何 H2/H3 的 `#` 等级保持不变；只在显式「保存标定」时持久化文件分组。
- **自动化**：`ui-spikes/v3-directory/tests/irWorkbenchBrowser.cjs` 连续点击 + `isConnected` DOM 稳定性 + 文件分组状态；`src/documentIrChapters.test.ts` 允许 H2 单独起文件。iPad Safari 真实手势待人工审核。

## FC-V3-MD-PREVIEW-SCROLL-001 / UIC-V3-MD-PREVIEW-SCROLL-001 · MD 源码与预览双向同步滚动

- **初始状态**：V3 工作台进入「章节定界」或「逻辑块清洗」，下窗显示 MD 预览；同一份全书 MD 在 CodeMirror 源码与 markdown-it 预览显示，至少包含多个源行锚点。
- **操作**：滚动 MD 源码，则下方 MD 预览滚动到对应的源码行块；反向滚动 MD 预览，则源码滚动到对应行附近。
- **预期**：使用 Markdown 解析后的 `[data-source-line]` 元素定位，按块近似对齐，不使用视口高度百分比；源码光标/选区完全不变；两窗不会回弹循环，脚注、图片预览渲染不受影响。切换 PDF/MD 标签再回来，恢复并对齐当前源码位置。
- **限制**：仅可见 MD 预览响应；不影响 PDF 页码、AG 行与标题选区。没有源码锚点的 Markdown 空白片段安全回退到最近块。
- **自动化**：`tests/irWorkbenchBrowser.cjs` + `tests/irSavedBookReopenReadOnly.cjs` 验证跨段向前/向后滚动及光标保留；iPad Safari 惯性滚动待用户审核。

## FC-V3-PREVIEW-INITIAL-MD-001 / UIC-V3-PREVIEW-INITIAL-MD-001 · 工作台 MD 优先，PDF 加载完成后可选

- **初始状态**：用户从目录列表按「设为工作目录」进入 V3 工作台；目录里有大 PDF 或 PDF 不存在/损坏。
- **操作**：进入工作台，查看右下预览标签；期间 PDF.js 后台按 Range 读取与初始化，结束后用户可以点击 PDF 标签。
- **预期**：首次进入立即选择 MD 预览；PDF 标签在 `empty/loading/rendering/error` 时灰色不可点击，PDF.js `ready` 才恢复可点击，默认**不自动抢回 PDF**。手动切换 PDF 后，可点击 MD 标签返回；选择另一 PDF 时重置为 MD 并等待新 PDF 就绪。
- **不变量**：加载 PDF 仍在后台执行，不阻塞 DIRjson/MD 来源读取；不存在有效 PDF 时不误标为就绪，失败后允许重试，不破坏真实 PDF/OCR 和用户草稿；AG→PDF 精确定位仅 PDF ready 时有效。
- **自动化**：`tests/irWorkbenchBrowser.cjs` 检查准备中禁用及 ready 可用，切换工作目录与 PDF 文件；iPad Safari 真机触控待用户审核。

## FC-V3-NO-PDF-WORKBENCH-001 / UIC-V3-NO-PDF-WORKBENCH-001 · 书库根目录误选不再假性卡死

- **复现来源**：iPad 2026-10-10 截图显示工作台位于 `Obsidian/ocr2md/ocr2md`（书库根目录），源码一直写「正在检查已保存 DIRjson…」，AG 空白、未生成 MD。书库根目录无 PDF（PDF 位于各书籍子目录），因此 `showReviewMode` 无法找到 `activePdf`，根本不会调用 `irPanel.open()`，占位文本永不结束。
- **操作**：在书库根目录（包含子目录、但没有直接 PDF 文件）点「设为工作目录」，也涵盖切换到无 PDF 的任意文件夹。
- **预期界面**：工作目录仍留在目录页，错误明确告知「当前目录没有直接的 PDF，请双击具体书籍文件夹再设为工作目录」；原来的已挂载工作台不可被错误目录替换。若通过其它入口显示了无 PDF 的工作台，也必须替换加载占位为相同的可操作错误，而非无限转圈。选择含 PDF 的真实书籍目录后，正常进入 V3、检查保存的 DIRjson、加载章节表与 MD。
- **数据副作用**：只读预检查；不写、创建、移动、替换 PDF、OCR、DIRjson 或章节 MD。
- **回归**：`tests/irWorkbenchBrowser.cjs` 增加无 PDF 的根目录误入场景，再继续进入有 PDF 的 fixture 验证整链；WebKit/iPad 真机可独立审核。

## FC-V3-AG-FOURWAY-NAV-001 / UIC-V3-AG-FOURWAY-NAV-001 · AG 同一元素四窗定位但不切 PDF

- 初始状态：工作台 DIRjson 已打开，默认 MD 预览标签处于激活状态，PDF 已就绪或仍在后台加载；AG 行对应 OCR 元素有 PDF bbox、全书源码范围和 MD 预览源码行锚。
- 操作：点击 AG 标题/正文行，随后分别查看源码、MD 预览；再主动切换 PDF 标签。
- 预期：AG 行成为当前元素；源码滚动到所选元素（不会修改章节结构或丢失用户输入），MD 预览定位并以可见高亮标记对应渲染块；**预览标签始终保持原选中的 MD**。PDF bbox 或人工补录页号在背后记住，用户主动点 PDF 标签后才对同一元素居中并显示 bbox；再切回 MD 仍是该元素。若 PDF 尚未 ready，则不阻塞 MD/AG 定位，待就绪后用户切换才执行；不因 PDF 定位失败自动切换标签。
- 不变量：四窗使用同一 `blockId` 和同一 PDF 页来源；MD 渲染采用 DIRjson block 对应的 `contentFrom`/`source-line`，禁止凭文本相似猜测；PDF 自动定位不能覆盖用户当前预览选择；不得修改 PDF、OCR、DIRjson 或已保存 MD。
- 自动化：V3 `tests/irWorkbenchBrowser.cjs` 先验证点击 AG 后 MD 标签未变、源/预览元素一致，再切 PDF 验证 bbox/pageID，最后切回 MD；人工 iPad Safari 验收：待审核。

## FC-V3-PDF-THEME-001 / UIC-V3-PDF-THEME-001 · PDF 主题设置默认深色

- 操作：在 V3「设置」页面修改 `pdfTheme` 为 `dark`（默认）或 `light`，保存配置；返回工作台 PDF 标签观察 PDF.js 视图，刷新网页。
- 需要：PDF.js 已加载且主题仅影响本浏览器渲染外观，不修改 PDF 原始字节/文档结构。
- 预期：首次访问与重置设置均默认 `dark`；`dark` 使官方 PDF.js 页面的纸面及 canvas 呈深色阅读外观，标注框正常；`light` 使用 PDF 的原本浅色纸张，立即生效，保存后同一浏览器刷新保持设置。设置页配置表中可看到 PDF 主题项目，可编辑为 dark/light；非法值被拒绝。
- 不变量：不重新下载/重载 PDF，不更改缩放、页码、bbox、文本来源或 DIRjson；PDF 加载中改变主题也可在 ready 后生效；保留原始图片/文字提取来源，不破坏区域命中坐标。
- 自动化：`tests/irWorkbenchBrowser.cjs` 验证默认 dark、切 light、保存后恢复、非法值拒绝、PDF bbox 不变；iPad Safari 实机审核待用户审核。

## FC-V3-REALBOOK-AG-FOCUS-001 / UIC-V3-REALBOOK-AG-FOCUS-001 · 真实长书 AG 元素进入 MD 可视区域

- 复现：iPad Safari 2026-10-10 09:51，`Bufett’s Alpha` 中 PDF 18–19 页附近选中 `Appendix A: Data Sources and Methodology` 标题后，源码第 568 行定位，但切回 MD 预览时对应标题未进入可视区域；PDF 18 页黑屏并出现整页卡顿。
- 操作：进入真实书籍的**隔离只读副本**，选择第 18/19 页标题；保持 MD 标签，检查当前块的渲染节点矩形完全进入预览 viewport 上半区；再点 PDF 标签，等待页面真正绘制后验证 OCR 框位置。
- 效果：使用稳定 `blockId`，不要用同名标题文字猜测。AG 程序化源定位时暂停普通源码/预览滚动同步，防止抢焦点；在图片/布局变化后重新纠偏，使语义块落入视口。切换 PDF 页时不在不可见状态渲染大型 canvas，不让深色 canvas 滤镜阻塞 iPad 主线程；PDF 未绘制要有可见加载反馈而不是黑屏。
- 不变量：不改变光标选区、MD/PDF/OCR/DIRjson 内容，不自动切换预览标签；只对一个真实选中块定位；无 OCR bbox 的补录只跳页面。
- 自动化：大型真实书籍只读隔离测试与 WebKit iPad viewport；真实 Safari 最终人工审核待用户确认。

## FC-V3-CHAPTERS-PUBLISH-001 / UIC-V3-CHAPTERS-PUBLISH-001 · 从已定界 DIRjson 发布可编辑章节

- **操作**：在 V3「章节定界」页面完成独立章节文件边界和文件名并「保存标定」，随后点击顶部「发布章节」，确认后进入书籍根目录 `chapters/` 开始逐章清洗。
- **需要**：当前保存的 DIRjson 已有完整的章节文件边界及名称（`chapter-files-for-cleaning` 或 `confirmed-chapters`）；保存版本 SHA 与服务器当前指针相等，PDF/OCR 内容哈希未改变；DIRjson 源码没有未同步/未保存改动。**分章发布不要求 21 项 OCR 标题都审核完成；标题审核留到逐章清洗，绝不可因此擅自写入 `confirmed`。**
- **预期**：首次发布基于已验证的不可变快照，把各独立章节 MD 直接写入 `chapters/`，包含用户确认的文件名及原始 `#` 标题层级。隐藏的 `.ocr2md-published.v1.json` 记录来源 SHA 和逐文件 SHA。前端显示实际章节数量、路径。每次点击必须用户确认，并只执行服务器认证授权的 `POST /__v3/ir/publish-chapters`；页面不能直接对原始 PDF/OCR 或 generic WorkspaceFS 发写入。
- **无修改重复发布**：若 `chapters/` 已存在且标记、版本、文件名、文件哈希完全一致，只报告「已发布且校验一致」，不重写或修改任何文件。
- **冲突/保护**：如果 `chapters/` 已存在任何非该版本管理的文件或子目录（包括此前 V2 逐章清洗的旧章节文件夹），**整次拒绝发布**；任意单个 MD 被人工修改、增删文件、来源快照陈旧或章节未全审，也必须拒绝，保留所有清洗成果，禁止覆盖/清理/移动。真实 `Bufett’s Alpha/chapters/` 已有七个 V2 章节目录，**不得自动碰它们**。
- **安全性**：新目录先在同一书籍下写入临时 staging，再在 macOS 使用 `renamex_np(RENAME_EXCL)` 排他发布；禁止目录符号链接、路径穿越、重复命名；每个 MD 与提交源 ZIP 的哈希一致。保存端原子指针和旧不可变历史快照保持不变。
- **自动化**：`tests/chapterPublishBrowser.cjs` 在 Chrome/WebKit 使用独立 Vault 做首次发布、重复发布、人工修改后拒绝且内容保留；`../v2/tests/v3ChapterPublishSmoke.py` 直接测试真实后端校验、旧 V2 目录保护、过期指针拒绝、未定界拒绝、发布幂等、清洗改动保护。人工 iPad Safari 验收：**待用户审核**。

## FC-V3-PUBLISH-FILE-CUT-002 / UIC-V3-PUBLISH-FILE-CUT-002 · 已标定章节文件即可发布，不等待 OCR 标题逐项审核

- **现场复现**：2026-10-10 真实 `Bufett’s Alpha` 当前保存的 DIRjson 中已形成 6 个有序、合法的章节 MD 文件名，书籍旧 `chapters/` 已改为 `chapters bk/`，新 `chapters/` 不存在；但 21 个 OCR 标题候选仍为 `needs-review`，原先的 `isIrChapterDelimitationConfirmed` 导致顶部「发布章节」灰色，保存快照仅有 whole-book-draft.md。
- **操作**：用户确定章节文件边界/文件名后保存标定，直接点击「发布章节」，确认进入后续逐章清洗。
- **需要**：`isIrChapterFileLayoutReady`（所有输出文件边界有合法文件名、DIRjson 逻辑块覆盖完整），当前真实书籍保存版本存在且无本地未保存修改，PDF/OCR 不变；不要求每一条 OCR 标题变成 `confirmed`。
- **效果**：按钮可点击；如果保存版仍是旧 `whole-book-unreviewed` 快照，点击后先由受授权的 `saveIrSnapshot` 带 CAS 生成**新** `chapter-files-for-cleaning` 快照（DIRjson 块/标题候选/audit 不变），读回 SHA 与来源通过，随后在原本空置的 `chapters/` 发布 6 份 MD。旧 `chapters bk/` 原封不动。页面报告实际文件数量和剩余审核候选数。
- **不变量**：不因文件定界而自动确认 OCR 标题、注释或正文；不改变 `#` 层级；用户在浏览器有未保存修改则不能发布；没有文件名不得绕过；旧 `chapters/` 若有数据绝不覆盖；所有原始 PDF/OCR 和真实书籍 WIP 均受保护。
- **自动化**：`src/documentIrMarkdown.test.ts` 区分文件可发布与候选已审；`tests/chapterPublishBrowser.cjs` Chrome/WebKit 以 unreviewed/已命名 fixture 完成保存、发布、重复幂等、防人工覆盖；`tests/irSavedBookReopenReadOnly.cjs` 在真实 `Bufett’s Alpha` **隔离副本**中验证旧保存快照升级为分章快照、6 个 MD 已发布、21 项保持待审核、旧 `chapters bk/` 保留；`v3ChapterPublishSmoke.py` 验证后端拒绝无文件名草稿并允许待审但具备文件边界的新状态。iPad Safari 真机审核：待用户确认。

## FC-V3-PUBLISH-SMALL-REQUEST-003 / UIC-V3-PUBLISH-SMALL-REQUEST-003 · iPad 发布不再传输大 ZIP

- **故障证据**：2026-10-10 真实书籍当前指针仍停在 10 月 9 日 `whole-book-unreviewed`，新 `chapters/` 不存在；Mac 实际服务 11:24:03 的 `POST /__v3/ir/commit` 400，日志 `JSONDecodeError: Unterminated string`，表示浏览器提交的大型 base64 ZIP JSON 未完整到达服务端。此前测试产生的 publish 403 不可直接归因于真实用户。
- **操作**：书籍有已保存 DIRjson、6 个有文件名的独立章节切分且没有未保存改动；用户按「发布章节」，确认一次。
- **需要**：请求只携带书籍路径、**当前保存 SHA**和**当前 DIRjson SHA**；后端从已保存已校验的不可变 ZIP 读出完整 DIRjson，用本地受控 Node 算法生成分章 ZIP，CAS 成为新的不可变版本，再安全发布到 chapters/。禁止把未经保存的浏览器草稿传上去冒充定界结果。
- **效果**：低于 1 KB 的 HTTP JSON 请求就能得到包含 `published=true`、`count=6` 的回执，用户看到真实章节路径；即使旧归档仍为 `whole-book-unreviewed`，自动升级投影为 `chapter-files-for-cleaning`，21 个 OCR 未审核状态保留。页面展示实际生成的文件数与路径。只有全部文件生成后才显示「成功」。
- **禁止**：不得覆盖现存 `chapters/`、`chapters bk/`、原始 PDF/OCR，禁止原始 IR 内容自动改写、绕过认证、未经校验的客户端任意路径和未保存草稿。若 CAS 版本变化，应返回冲突而非替换。
- **验收**：Chrome/WebKit 小请求体真实按钮测试；生产后端在隔离真实书籍副本上发布 6 个文件，校验版本、名称、原始候选状态、零数据误写；故意截断大上传的测试场景不影响小请求发布。iPad Safari 真机待用户审核。

## FC-V3-PUBLIC-STATIC-SPEED-001 / UIC-V3-PUBLIC-STATIC-SPEED-001 · 公网入口静态资源缓存与二次访问

- **用户现象**：2026-10-10 17:48 公网远慢于 LAN。原 Mac curl 本地 `index.html` TTFB 0.006～0.04 秒，而公网 1.4～2.7 秒；主 JS 3.17MB 本地约 0.01 秒，公网约 10～18 秒并曾超时。Cloudflare 响应 `cf-ray ...-AMS`，应用 Tunnel 连接 LAX 两条，Mac DNS 显示 Shadowrocket 假 IP 198.18.0.70。公网 `/v3-directory/dist/app.js` 响应 `cache-control: no-store`、`cf-cache-status: BYPASS`；旧 Service Worker 同时预取 unversioned `app.js`、又对有版本的脚本执行 network-first，可能重复下载。
- **操作**：用户第一次打开公网 `/v3-directory/`，刷新、再次进入工作台、或打开更新后的版本。
- **需要**：当前静态发布版本包含唯一 `?rev=v3-...` 的 JS 和 CSS URL，bundler 字体按内容哈希命名。HTML 与 sw.js 以及任何 `__v3` 私有 FS API 均不能缓存为公开 CDN 资源。
- **效果**：只有精确标记了 `?rev=` 的 `/v3-directory/dist/app.js`、`app.css` 和有构建内容哈希的字体享有 `Cache-Control: public` 及 Cloudflare CDN 可缓存；HTML/Service Worker/API 继续 `no-store`。Service Worker 安装不额外下载 3MB 大 JS，静态 `/dist/` 的再次访问由本版本 cache-first 命中，页面导航继续 network-first 保持应用更新，离线时才回退 HTML 缓存。版本号变更后新资源请求必须精确匹配新 URL，禁止 `ignoreSearch` 命中旧 JS。
- **不变量**：不缓存 `/__v3/`、OCR、DIRjson、章节 MD、PDF、个人访问密钥；不修改 Tunnel、Agent Link、DNS、Shadowrocket 或公网路由；不禁用 Service Worker 更新；首访可能仍受代理绕行/AMS→LAX 网络影响，不能宣称网络故障已全部解决。
- **验收**：HTTP header 测试用 V3 本地 fixture/生产服务比对静态资源与敏感接口缓存策略；Chrome/WebKit Service Worker 缓存二次加载不额外请求大 JS，版本变化时必须获取新 JS；公网 Cloudflare 需验证静态缓存不再 BYPASS，而动态 API 禁止 CDN 缓存；iPad Safari 最终人工审核待用户确认。

## FC-V3-TOP-TABS-ACTIONS-001 / UIC-V3-TOP-TABS-ACTIONS-001 · 顶部标签栏右端操作与版本号

- **操作**：打开 V3 → 设为工作目录 → 在「章节定界」或「逻辑块清洗（IR）」进行修改；在全局「工作目录／工作台／设置」标签栏**最右端**点撤销、重做、保存标定/保存 IR、发布章节。用户可点「工作目录」标签返回目录，不再需要第二行「刷新／切换目录」。
- **需要**：已加载工作台和 IR 时才显示 4 个操作按钮，按钮禁用/脏态沿用 `IrWorkbenchPanel.renderControls`，不得额外生成与原按钮 ID 冲突的代理按钮；其他模块原行为不变。
- **效果**：「ocr2md v3」标题旁显示当前真实构建版本；顶层标签栏最右显示单份编辑操作按钮；原工作台第二行只保留当前书籍路径；删除工作台「刷新」「切换目录」按钮（目录页的独立「刷新目录」不删除）。MD 源码窗不再展示自有顶栏，代码编辑器获取纵向空间；底部 MD/PDF 预览 Tab 仍存在。iPad 宽度不得横向溢出；狭窄屏幕编辑按钮可以自然换行。
- **禁止**：不得改变 DIRjson 撤销/重做、CAS 保存、发布保护、当前源码/预览/PDF 关联；不得误把源码栏内部隐藏的控件销毁，以免其他模块调用空元素；不可触碰已发布 `chapters/`、旧目录或公共网络配置。
- **自动化**：Chrome/WebKit 真实工作台 DOM 和几何 UIC，核对版本文本紧跟标题、顶栏按钮 DOM 归属及右对齐、4 按钮唯一、刷新/切换工作台按钮不存在、源码顶栏实际不占高度、AG/CodeMirror 操作及撤销重做真实通过、iPad 宽度无页面横向溢出，工作目录标签可返回。原 `irWorkbenchBrowser`、`irPersistenceBrowser`、真实书籍只读 UIC 更新导航选择器并复测。人工审核：待用户 iPad Safari 确认。

## FC-V3-NAV-CHAPTER-CLEAN-001 / UIC-V3-NAV-CHAPTER-CLEAN-001 · 顶部目录导航决定工作模块

- **操作**：工作目录中选择一本 PDF/OCR 书籍，点击「设为工作目录」；顶部标签顺序是「工作目录」「设置」「工作台」，工作台右侧是“目录导航”下拉（本书根目录 + `chapters/*.md`）。选择书籍根目录自动进入「章节定界」；选择某个 `chapters/*.md` 自动进入「章节清洗」。可返回根目录或换另一章。
- **需要**：Mac Vault 已授权；书籍根目录含原 PDF；下拉章节选项必须来自 Vault 实时列表的真实 `chapters/` MD，拒绝猜测和遍历旧 `chapters bk/`。只能操作当前书籍。
- **效果**：切根目录时 AG 为全书章节边界表、源码为 DIRjson，并由原「保存标定」「发布章节」控制；切具体章节时 AG 为该 MD 扫描出的文本块、源码为该章节真正的 CodeMirror 可编辑内容、MD 预览实时跟随编辑、PDF 仍指向书籍原文，顶部“保存章节”只对该章节做 CAS 写入。工作台标签与目录导航为统一入口，用户不必先选择“清洗模块”。
- **不变量**：已有未保存修改时切章节/回根目录需确认才能放弃；保存前核对服务端 nodeId + revision 并在 macOS NSFileCoordinator CAS 替换，仅作用于当前书籍 `chapters/` 中原有已发布的 `.md`，禁止通用 MD 覆盖、禁止修改原始 PDF/OCR/旧 `chapters bk` 或已保存 IR 快照。保存冲突不能清空编辑器，文件过大或权限失败必须有明确错误。
- **验收**：独立 Vault/书籍 fixture，Chrome/WebKit 导航实测书籍根→章节→修改→保存→读回、回根→另一章、冲突拒绝与脏态提示、顶栏布局；新章节列表只包含真实 MD，不含旧目录及标记文件。Mac/iPad 真机仍待用户人工审核。


## UIC-V3-NAV-CHAPTER-CLEAN-002 · 修复章节清洗 AG 表不可见（2026-10-10）

- **初始状态**：真实已发布 `chapters/` 存在，顶部顺序「工作目录 / 设置 / 工作台 / 目录导航」。
- **操作**：目录导航选择 `chapters/02 Appendix A Data Sources and Methodology.md`。
- **预期**：模块名称「章节清洗」，可见该 MD 扫描出的**实际 AG 文本块表**、可编辑 CodeMirror、实时 MD 预览，顶部可保存章节；此时不再显示容易混淆的旧「章节定界」快捷按钮或旧模块菜单。不能仅生成隐藏 AG 行。
- **返回**：下拉选书籍根目录，恢复「章节定界」IR AG 表/源码，隐藏文本块 AG 表，显示「章节定界」原快捷按钮和编辑功能；绝不混合两个模块的状态。
- **不变量**：两种模式都由同一个目录导航控制；原始 PDF/OCR/IR、旧 `chapters bk/` 不改；有未保存改动时取消导航必须留在当前章，保存章节仅对当前文件做 CAS。
- **自动验证**：`irSavedBookReopenReadOnly.cjs` 的 `OCR2MD_NAV_CLEAN=1` Chrome + WebKit 浏览器 UI，明确使用 `isVisible()` / `isHidden()` 验证 AG、源码、旧模式按钮，不能仅 `innerText()` 检查隐藏 DOM。
- **用户人工审核**：待 iPad Safari 确认。

### UIC-V3-NAV-CHAPTER-CLEAN-001：固定顶部导航复核（2026-10-10）

- **初始状态**：未设工作目录时，顶栏「工作目录」「设置」「工作台」始终依次可见，`工作台`与右邻目录下拉为禁用状态，**不隐藏**；进入「设置」或回「工作目录」标签后，它们仍留在相同的顶栏位置，不应消失、被前面 Tab 的宽度挤到最右或重排。
- **用户动作**：设置书籍为工作目录，观察顶栏位置；在「设置」页面直接用目录下拉选择书籍根、章节；返回根目录，再切某章。
- **预期结果**：工作台标签紧靠设置右侧，下拉紧靠工作台右侧；选择根目录后自动显示「章节定界」，选择 `chapters/*.md` 自动打开「工作台／章节清洗」并让对应 Markdown 可编辑；从其它标签使用下拉也要直接进入工作台，而不是仅更改隐藏页面的数据。
- **数据副作用**：单纯切目录不写文件；只有用户点击章节清洗保存时才调用专用 CAS 端点；原 DIRjson 和已发布章节不因导航被覆盖。
- **不变量**：iPad 834px 无横向溢出；窄屏允许整体栏换行但标签与下拉的先后顺序不变；未保存修改时禁止无确认切换；未选书时不允许误进入空工作台。自动化 Chrome/WebKit，真实 iPad 待审核。

## FC-V3-CHAPTER-HEADING-CLEAN-001 / UIC-V3-CHAPTER-HEADING-CLEAN-001 · 章节标题子模块与单一顶栏状态

- **操作**：进入已发布章节 MD 的「章节清洗」；左 AG 头的「章节清洗」为可展开下拉，第一清洗模块选项是「章节标题」（默认选中），相邻的「标题序号」checkbox 默认勾选。用户切换 checkbox、选 AG 标题行、修改右侧 MD 源码，再保存章节；书籍根下拉返回「章节定界」。
- **需要**：Mac Vault 认证、具体 `chapters/*.md` 有有效 Markdown；标题判定来自该 MD 实际以 `#` 开头的 ATX 行，并用真实源行定位（跳过 YAML frontmatter、fenced code 里的伪标题）。
- **效果**：「章节标题」AG 只列真实标题行，按现有 V2「章节标题」字段/样式渲染；标题序号默认显示 `(001)` 等**仅作为 AG 表中的视图前缀**，取消后序号消失，MD 源码、章文件 SHA 不变；正文编辑实时刷新标题 AG、MD 预览。下拉入口可持续扩展新清洗子模块，但当前只实现「章节标题」，不提供无效按钮。
- **布局**：删除工作台独立路径/书籍 bar 和重复「定位」按钮，工作台与当前章节路径仍由顶部目录导航可见；把唯一对用户可见的状态（保留 `id=status`）放在 `ocr2md v3 · <版本>` **版本号右侧**，文件、IR、章节、PDF 等内部状态标签仍接收事件但视觉隐藏，通过状态汇总显示到顶部状态条。屏幕窄时截断或换行，不溢出。AG 标题与顶部目录导航仍保留。
- **不变量**：切换「标题序号」不得修改 MD、不得触发保存/dirty；`#` 标题层级原样显示，不移除、不自动补序号；不存在假模块。源码编辑、撤销重做、CAS 保存、PDF 对照、目录导航、章节定界原有逻辑不变。任何路径目录信息不在第二条工作台工具栏重复。
- **自动 UIC**：Chrome + WebKit 真实书籍**隔离副本**，断言顶部唯一状态与版本同行、无可见工作台路径 bar / 重复定位、子模块下拉首项/默认选择、标题序号初始 true 与视图切换且文件/dirty 不变、标题表仅包括真实标题、点标题定位到源码、源码修改刷新 AG、保存与返回根路径；正常状态消息写入仅顶栏可见。真实 iPad Safari 人工审核待用户确认。

## FC-V3-CHAPTER-TOOLBAR-MINIMAL-001 / UIC-V3-CHAPTER-TOOLBAR-MINIMAL-001 · 章节定界去除旧控件，H1 筛选进入 AG 顶栏

- **人工审核**：待用户审核；Chromium/WebKit 自动验收通过。`manual-external`：真实 iPad Safari 手指操作和布局。
- **初始状态**：由“工作目录”选中一份 PDF+OCR 的书籍，按“设为工作目录”进入“工作台”的“章节定界”模式；顶部主 Tag、书籍／章节文件下拉及全局撤销／重做／保存／发布必须保持原有职责。
- **界面动作 / 效果**：AG 表头的同一行显示单一文本标签“章节定界”和默认勾选的“只看一级标题”复选框；复选框从表格上方独立占高的过滤行移入 AG 标题栏，不改变作用范围（只过滤 AG 的 H1，绝不改 DIRjson/源码）。普通定界不再显示重复“章节定界”模式按钮、旧“其他模块”切换下拉、“标定章节”表单入口、“顺序编号”旧式操作、“目录/编辑”遗留块编辑菜单。旧控件及事件接口仍留在 DOM 中但于定界模式隐藏，以防共享 IR、源码和老场景调用空节点；真正的章节边界、独立成章与文件名继续直接在 AG 表操作。
- **OCR 来源特殊情形**：有且只有一份可用 OCR 或已有已保存 DIRjson 时，无 OCR 下拉干扰界面；若首次定界检测出多份 OCR JSON，显示唯一的、明确写作“OCR 来源”的选择器，并在选择后初始化 DIRjson 并自动收起。不能无依据地默选错误 OCR，也不得导致多来源书籍无法进入定界。
- **工作流不变量**：书籍／章节文件导航 `#workbench-path-nav` **必须保留**：书籍根目录选择章节定界，chapters/*.md 选择章节清洗。全局“保存标定”“发布章节”按钮不能删除；AG↔源码位置映射、可编辑 CodeMirror、PDF 原文预览、DIRjson 草稿撤销重做和发布保护均不变。隐藏旧按钮不丢失草稿或实际用户文件。
- **测试**：`npm run test:chapters:clean-ui`（Chromium 和 WebKit）使用真正的临时 Mac Vault fixture 含两份 OCR JSON，逐项验收 H1 可见性及上移位置、旧控件隐藏、OCR 来源选择器仅歧义时出现、保存发布入口存在、H1 滤镜不变更存储。完整章节/发布/PDF 见 `tests/irWorkbenchBrowser.cjs`、`tests/chapterPublishBrowser.cjs`、`tests/irWorkbenchBrowser.cjs` 的 MD↔PDF 流程。


## FC-V3-SETTINGS-UNDO-SARASA-001 / UIC-V3-SETTINGS-UNDO-SARASA-001 · 字体默认值与统一设置撤销重做

- **初始**：进入设置 Tag 前按钮禁用。共享设置完成 AG、源码、预览与字体加载后，顶部 `settings-undo` 与 `settings-redo` 均禁用。`mdFontFamily` 应显示默认 `sarasa`；旧缓存写入 `monospace` 的用户数据在内存映射到 `sarasa`，未经保存不应直接篡改 localStorage。
- **操作**：修改 AG 表单元格、参数预览布尔/颜色、CodeMirror JSONC 源码；在顶栏按“撤销 / 重做”或聚焦源码后按 Cmd/Ctrl+Z 与 Shift+Cmd/Ctrl+Z；点击恢复默认，然后尝试撤销；最后点击保存配置。
- **需要/效果**：所有场景共享一个最多 100 项的历史，源码连续输入合理归并，无效 JSONC 草稿可撤销到有效源码；AG 与源码始终同步；恢复默认不立即保存且可 Undo；每次修改仅改变草稿，只有 Save 才写 storage。按钮 `disabled` 由共享组件 history 事件决定。非设置标签的业务 Undo/Redo（如章节 DIRjson）保持原有独立历史。
- **不变量**：保留 `mdFontFamily=system` 显式字体覆盖选项；兼容历史 `monospace` 值；不涉及 PDF/OCR/章节文件或 Mac Vault 写入。主设置组件唯一维护 History，OCR2MD 不另外保存历史堆栈。
- **自动化**：`npm run test:settings:history` Chromium/WebKit；同时跑 `tests/settingsSmoke.cjs`、设置双向定位、预览、字体、章节发布回归。人工 iPad Safari 验收 `manual-external`，状态：待用户审核。


## FC-V3-CHAPTER-START-SEQUENCE-001 / UIC-V3-CHAPTER-START-SEQUENCE-001 · 章节定界起始序号输入框

- **初始状态**：工作台位于书籍根目录的“章节定界”模式，AG 标题栏同一行包含“章节定界”“只看一级标题”和新加的“起始序号”输入框（`#ir-v2-sequence-start`），默认 `01`；尚未加载有效 DIRjson 时该输入框不可编辑。其他 IR、清洗或普通工作目录不显示此框。新控件不恢复已删去的“顺序编号”按钮。
- **用户动作**：输入 `05`、`005` 等 1–6 位纯数字，并按 Enter 或移出焦点。框内允许 iPad 数字键盘并保留前导零。若已保存的 DIRjson 首章拥有数字文件名，则首次打开时应显示该起始序号，供用户核实。
- **预期效果**：复用核心 `v2IrAssignSequence`，仅按用户选中“独立成章”的一级标题顺序重新计算章节 MD **文件名**（例 `05 A Real IR Main Title.md`），不改 OCR 标题层级、原文、来源或 PDF 页码。AG 文件名列即时反映，修改进入已有 DIRjson 内存草稿，显示待保存；全局撤销/重做可还原文件名和输入框数值。取消独立成章仍继续沿用已有章节文件合并与重编号机制。
- **非法输入 / 边界**：空值、非数字、超过 6 位时给出校验提示，不修改章节文件及 DIRjson。正在载入、保存期间或未有可用标题时禁用。按 Enter 不提交文件保存，仅执行草稿内重新编号；“保存标定”及“发布章节”仍须用户分别主动触发。未保存草稿不得发布；无真实书籍写入。
- **不变量**：正常默认 H1 筛选、AG↔源码/PDF 定位、章节清洗导航、唯一完整 DIRjson 中间数据以及既有历史操作不变；不重复添加旧式二次编号按钮。输入框永远不是独立配置文件中的设置项，也不重置用户书籍的章节文件层级。
- **自动化**：`npm run test:chapters:clean-ui` 在 Chromium/WebKit 读取临时夹具（两份 OCR JSON），验证输入框位置和初值、`01→05`、Enter 交互、AG 文件名更新、Undo/Redo 回滚、非法输入不产生更改、IR 模式隐藏、390px 窄屏可见且零真实 Vault 写入。再跑 `tests/irWorkbenchBrowser.cjs` 全量 DIRjson 编辑、`chapterPublishBrowser.cjs` 章节发布与 `chapterHierarchyBrowser.cjs` 层级回归。实际 iPad Safari 键盘和触摸待用户审核。
