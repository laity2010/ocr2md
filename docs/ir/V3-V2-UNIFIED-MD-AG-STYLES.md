# V3 统一复用 V2 Markdown、AG Grid 样式与设置

日期：2026-10-09。业务模块：`工作台 → 章节定界 / 逻辑块清洗`、`设置 → V2 样式与工作台设置`。

## 技术决策

1. **不重新造编辑器或预览器**：V3 保留已经复用的 `ui-spikes/v2/src/workingEditor.ts`（CodeMirror Markdown + 层级行装饰、Obsidian/LaTeX 高亮）与 `ui-spikes/v2/src/basicMarkdownPreview.ts`（MarkdownIt + KaTeX + DomPurify + V2 注释/嵌入块兼容）。把 V2 `index.html` 中 Markdown 预览的代码块、表格、引用、callout、注释、图片排版规则移植到 V3，且仅对两个 MD 预览容器生效，不影响 PDF.js。
2. **统一 AG Grid 主题**：目录 AG、IR 章节定界与逻辑块 AG、旧审核 AG 都调用 `ui-spikes/v2/src/calibrationTheme.ts` 的 V2 Quartz dark 配色；目录单独保留原有目录字号 `gridFontSize`，IR AG 使用 `workbenchGridFontSize` 与 `workbenchGridRowHeight`。没有复制或重建 AG 表/筛选业务代码。
3. **统一 H1–H6 层级**：实际生成的 Markdown 标题语法决定 AG 预览的层级（不是不准确的原 OCR `level`），使用与 CodeMirror/Markdown 预览相同的六级标题颜色与倍率；AG 展示 `# …` / `## …` 等，不包含原始标题判定以外的伪内容。人工把 OCR 标题定为「非章节」后，生成 MD 和 AG 同时按普通文本显示，原 OCR title/source IDs/bbox 保持。
4. **标题不会被裁断高度**：AG 根据 V2 H1–H6 倍率、源码基础字号动态计算标题行高，普通文本行按设置的基础行高；字号设置更改后 `resetRowHeights`，保留 AG 列筛选/固定列等行为。
5. **所有样式参数只存本机浏览器配置** `ocr2md-v3-directory-settings-v1`：不写原书、OCR JSON、IR、`.obsidian`，也不改动 V2 设置。重用 V2 的 `TableConfigurationGrid` + `JsonSettingsEditor`，「设置」标签按功能组显示；保存后即时生效、刷新后保持，恢复默认回到 V2 的色值和倍率。旧 V3 JSON 缺少新字段时以默认值兼容迁移。

## 设置项（Feature Contract）

- `gridFontSize`、`gridDensity`：原工作目录 AG 设置保持独立。
- `workbenchGridFontSize`（11–22px）、`workbenchGridRowHeight`（28–74px）：工作台 AG 的字体与普通行高。V2 同一深色主题。
- `mdSourceFontSize`（11–24px）、`mdSourceLineHeight`（1–2.5）、`mdShowHardReturns`：V2 CodeMirror 源码字体、行距及 `↵` 标记。
- `mdPreviewFontSize`（11–26px）、`mdPreviewLineHeight`（1–2.5）：V2 Markdown 预览字号与行距。
- `mdFontFamily`：`monospace`（V2 默认）/ `system`。用于源码、预览和层级 AG 文本。
- `mdHeadingSizes`：六个 H1–H6 相对源码/预览基础字号的倍率，默认 V2 `[2.125,1.625,1.375,1.25,1.125,1.125]`。
- `mdHeadingColors`：六个 H1–H6 色值，V2 默认 `[#da6362,#d77f48,#bf983d,#899c40,#569d79,#b87b9d]`。
- `mdCodeColors`：V2 十一种 CodeMirror Markdown/LaTeX token 色值（评论、链接、URL、函数、关键字、操作符、属性、字符串、标签、数值、标点）。

每个颜色只接受 `#RRGGBB`；字号和行距有限界；不允许 CSS 函数、URL 或多余未知设置字段注入。

## 功能规范与 UIC

**FC-V3-STYLE-01** 操作：进入 V3 `设置`，选择 `AG 表样式 · V2` / `MD 源码 · V2` / `MD 预览 · V2` / `MD 六级标题 · V2`，修改右侧 JSON 并保存。需要：合法字体、尺寸和颜色数据。效果：不刷新工作目录与 IR，立即重新渲染 CodeMirror/预览，AG 标题行按新的 V2 标题排版重算，浏览器本地保持，不修改 Vault。

**FC-V3-STYLE-02** 操作：在章节定界 AG 选择 OCR 标题。需要：从当前 Document IR 生成的 Markdown 块。效果：AG 预览中的 `#` 层级、颜色与大小根据生成 MD 的该块判定，与右上源码窗对应；非章节只显示原 OCR 文本，且不伪装为标题。

**FC-V3-STYLE-03** 操作：预览章节 MD。效果：实际复用 V2 的 Markdown/KaTeX/注释组件，表格、代码块、图片的排版与 V2 统一。原始 OCR/PDF 来源与审核状态不改变。

**UIC-V3-STYLE-01 · browser-auto** 初始：OCR fixture 书籍已载入、章节定界显示 H1 与 H2。动作：在设置中将 H1 颜色改 `#aabbcc`、倍率改 `1.9`、源码字号设 16px、预览字号设 18px、工作台 AG 字号设 15px，并保存。预期：AG H1 与 CodeMirror H1 均为 RGB(170,187,204) 与 30.4px；MD 预览 H1 为 RGB(170,187,204) 与 34.2px；H2 仍有独立层级，PDF 原文定位不丢失。副作用：只写 V3 本地配置，无 Vault 写请求。

**UIC-V3-STYLE-02 · unit + browser-auto** 初始：设置页输入非法字号、CSS 注入字符串或不完整颜色数组。动作：保存。预期：错误提示，之前的样式和已保存配置不变。

**UIC-V3-STYLE-03 · regression** 初始：旧版 V3 用户只保存了目录 JSON 配置。动作：加载工作台。预期：旧配置保持、V2 样式新字段使用默认值；旧人工审核、PDF 定位、IR 定界、版本保存不回退。

**UIC-V3-STYLE-04 · manual-external** 用户检查 iPad 上的实际阅读舒适度、Obsidian 字体视觉效果及 iCloud 跨设备配置是否需要单独迁移；自动验收不替代人工目视。

## 验收命令

```bash
cd ui-spikes/v3-directory && node tests/settingsSmoke.cjs
npm --prefix ui-spikes/v3-directory run test:ir:ui
npm --prefix ui-spikes/v3-directory run test:ir:ui:real
npm --prefix ui-spikes/v3-directory run test:ir:persistence
npm --prefix ui-spikes/v3-directory run test:review
npm --prefix ui-spikes/v3-directory run test:bidirectional
npm --prefix ui-spikes/v3-directory run test:ui
```

所有 OCR 与 PDF 原文件不在本次样式功能写入范围。Git WIP 保持，禁止 reset/clean/rebase/force push。

## 完成与验收记录（2026-10-09）

- `V3_DIRECTORY_SETTINGS_CONTRACT_PASS`，新增设置默认值、旧 JSON 兼容迁移、颜色/倍率/字号/行距严格校验通过。
- `test:ir:ui` → `IR_WP5_BROWSER_FIXTURE_PASS`：AG H1/H2 与 CodeMirror 按当前 IR 生成 Markdown 对齐；设置 H1 颜色 `#aabbcc`、源码字号 16/预览字号 18、倍率 1.9 后，在 AG 和源码同时得到 30.4px/同色，预览得到 34.2px/同色；选项实时保存；零 Vault 写入。
- `test:ir:ui:real` → `IR_WP5_REAL_BROWSER_PASS`：真实 224 个逻辑块/19 个章节/22 页书籍可加载并溯源；原 PDF/OCR/旧映射 SHA 不变，iPad 适配通过。
- `test:ir:persistence` → `IR_WP7_BROWSER_PERSISTENCE_PASS`：两浏览器同时操作、CAS 冲突阻止、第三会话复原通过。
- `test:review` → `WP7_REVIEW_CAS_UNIT_OK`；`test:bidirectional` → `WP6_BIDIRECTIONAL_INDEX_UNIT_OK`；`test:ui` → `V3_MAC_VAULT_HTTP_BROWSER_E2E_PASS`，旧版模式与目录不回退。
- 新设置 TypeScript 严格检查、`git diff --check` 通过；未 reset/clean/rebase/force push、未提交 Git，保留所有 WIP。
- 发布版本 `ocr2md-v3-v2-md-ag-settings-20261009a`，本机 `/v3-directory/` 与公网 `https://ocr2md.laity.bid/v3-directory/` 均 HTTP 200；正式页面可找到 V2 样式设置与标题单元格。**人工目视审核仍待用户确认**。
