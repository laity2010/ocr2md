# OCR2MD V3 · 章节清洗中的 math/LaTeX 围栏必须排版而非显示代码

- Feature Contract：`FC-V3-CLEAN-FENCED-MATH-KATEX-001`
- UI Interaction Contract：`UIC-V3-CLEAN-FENCED-MATH-KATEX-001`
- 状态：桌面 Chromium 与 WebKit 受控真实章节测试通过；**iPad Safari 待用户审核** (`manual-external`)

## 复现

真实 `Obsidian/ocr2md/ocr2md/Bufett’s Alpha/chapters/01 Buffett’s Alpha.md` 第 126–128 行：

````md
```math
L _ {t} = \frac {\mathsf {T A} _ {t} ^ {M V} - \mathsf {C a s h} _ {t} ^ {M V}}{\mathsf {E q u i t y} _ {t} ^ {M V}},
```
````

旧版 V3 章节清洗继承 V2 `BasicMarkdownPreview`，只支持带 `$` 等约定分隔符的 KaTeX，不识别 MinerU 的 ` ```math ` 数学围栏。因此预览显示灰色源码块，用户 iPad 截图 2026-10-11 21:25 确认。真实章节一共有 **12 个** math 围栏，经 KaTeX `throwOnError:true` 独立校验全部语法有效，没有必要猜测 OCR 修复。

## 操作 / 需要 / 效果

选择书籍后进入章节文件的清洗模式，MD 预览窗显示以下内容：

- 有效的 ` ```math`、`~~~latex` 和 `~~~tex` 围栏，按 KaTeX `displayMode:true` 生成真实 display math（分式、上下标、\mathsf 等），大公式在预览内横向滚动而非扩展整页宽度。
- 普通 `$...$`、`$$...$$` 的 V2 渲染仍由 V2 实现，不能重复触发。JS/Python/` ```md ` 内即使包含数学字符串，仍按代码显示。
- 错误或缺损 OCR 数学围栏不得伪装成功，也不得自动修改原公式；改为显眼提示“公式解析失败，请核对 PDF 原文”，同时以安全转义的纯文本保留全部公式源码。无对应闭合围栏或过大输入保留为代码，不对不可信 LaTeX 执行宏注入、外域加载或脚本。
- 公式来自当前源码第 N 行时，MD↔源码双向定位保持同一行号（真实首个公式第 127 行）；预览范围内的转换只用等数量空行替换围栏，以保留 MarkdownIt 的 `data-source-line`。
- 使用 KaTeX `trust:false`、受限展开和尺寸、`throwOnError:true`。生成的公式 HTML 仍经 V2 的 DOMPurify 过滤和既有 V2 公式 CSS，安全性与代码围栏协议不退化。

此能力仅属于 **V3 章节清洗的 MD 预览字符串**；真实 MD、DIRjson、PDF、代码仓中 V2 原生渲染器、文件路径、保存／发布均不改变。实时源码编辑时预览更新，错误修正后可恢复正常排版，撤销／重做仍基于原始文本。源码中的普通未标定 `\mathsf` 字样不是可靠的独立公式，未经用户指定不会推测数学片段边界。

## 自动验收

1. `cd ui-spikes/v3-directory && npm run test:clean:preview-v2`：受控 Mac Vault fixture 同时包含有效 `math`、`LaTeX` 公式、错误 `math` 围栏与 JS/HTML 代码。Chromium/WebKit 断言合法公式对应 `.ocr2md-fenced-math .katex-display .mfrac`，解析错误有警告与原文；普通代码围栏保持原样；公式锚点对应实际 MD 源码行；原 HTML 表格及 V2 Markdown 元素渲染继续正确，零用户 Vault 写入。
2. `OCR2MD_TEST_REAL_FENCED_TABLE_PATH="<本机真实章节绝对路径>" node tests/chapterHierarchyBrowser.cjs`，以及 `OCR2MD_TEST_WEBKIT=1`：从真实 Buffett 原章节读取，只在独立临时 Vault 副本打开。必须有 **12 个** `.ocr2md-fenced-math`（首条含 `.mfrac`），0 个解析错误或被错误当作代码显示的 `\mathsf` 数学围栏；仍有 **7 个**真实 HTML 表格、首条对应第 127 行、未修改原始 MD、零用户文件写入。
3. `node tests/chapterHierarchyBrowser.cjs`：H1–H6 清洗 AG、层级、标题序号不退化；`node tests/irWorkbenchBrowser.cjs`：DIRjson/PDF/MD 显示与导航；`node tests/chapterPublishBrowser.cjs`：章节发布。
4. 实际 iPad Safari 第 127、138 行及其他公式、横向滚动与字号视觉审核属于 `manual-external`，需用户确认。
