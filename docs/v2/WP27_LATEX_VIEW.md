# WP27 · V1 LaTeX View
基线 cb7c022。V1 bf32515 的 latex-index.js、latex-view.js、latex-view.css、既有 latex-scan.js 逐字节一致；复用 V1 PDF.js renderFormulaCrop/focusFormula/setFormulaHighlights。V2 公共 MD Line 及当前 revision 提供实时正文和定位，原 pdf-map 仅追加只读 formulaBlocks，从 base_blockid + raw_path 对应的不可变原始 element 取出公式证据，页尺寸和 Span bbox 取原始物理页。未增加实体表/写接口/第二正文。原始 OCR-only 或过期源码引用不得凭猜测指向其他块，MD-only 不制造截图。V1 原匹配算法（含同块唯一原文命中和独立公式修订关联）保留，KaTeX 成功仅代表语法可解析。
AG 列序、公式预览/错误/截图、全局默认页范围、134px 行高沿用 V1；清除继承的固定列状态，切出恢复原 35px 行高。独立页范围及过滤状态；其余视图保留。V1 focus-theme 的中间绿与选择描边用于 V2 源码、MD 已渲染公式、PDF 原始 Span，退出清除。原 MD renderer 的行内公式审阅策略不变，未被渲染的行内文本不强制转成公式。
直接测试 v2-latex.test.mjs：原始匹配、修订、MD-only、原 bbox、过期引用拒绝。test_v2_pdf_projection.py 八项通过：原始 Span raw_path、42 条公式、原始坐标、源库哈希和原两表不变。公共索引、AG 预设、注释 A/B/C 直接回归及统一布局门禁通过。
真实 sample 数据库只读复制验证：267 块、444 行；42 公式（22 行内、20 独立），42 有原始坐标及匹配源码，41 可渲染、1 失败。原书未写入。浏览器用隔离真实 SQLite 夹具及合成 PDF（不是用户 iPad 实机，截图验证的是原生 PDF.js 裁剪链路）。

最终 V2_TEST_LATEX_VIEW=1 node tests/v2-owned-edit.browser.test.mjs Chromium/WebKit 均 exit 0：42 公式、实际 AG 表头顺序与固定状态、134px 行高、实际公式字符焦点、原生 PDF 裁剪、源/PDF 标记、Markdown 实际 V1 绿高亮、添加渲染失败公式的原生输入与 SQLite 保存、Undo 恢复、切回原视图 35px 和清除高亮、标题列序及 PBS 固定不变。补充检查的初始 DOM 定位器错误及 PDF ready 重复投影导致陈旧行引用已纠正，最终完整重跑通过。
