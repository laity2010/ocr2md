# V2 WP04 · 真正的 V1 Lab-OCR 动态多轨 PDF PBS

## 错误根因
用户实机反馈前两次 PDF PBS 复刻失败。以前的实现错误地引用 Main/V6 的 ui/pdf-preview.js 和 layoutPDFEdgeRails，它只有左右各一条固定轨道、拥挤时缩小标签，并不是用户指定的 V1。旧 bd20a1d 虽声称直接复用 V1，但引用源版本错误，且纯 V2 PDF 映射将原生子块全部清空；曾以“不重叠”代替“动态多轨”验收。这是错误工程判断，不是技术必需。

## 真正 V1 组件
来源：独立 labs/lab-ocr 工作树，基准 ec7378e。现在逐文件复制 ui/lab-ocr 的 pdf-viewer.js、pbs-label-layout.js、pdf-viewer.css、pbs-family.js、pdf-block-drop.js、pdf-text-region.js、pdf-gesture-viewport.js、pdf-formula-crop.js。除 V2 的授权地址参数及隐藏 Pane 负缩放 guard 外，PDF 逻辑全部原样。真正公开组件 mountLabOcrPdf；真正算法 layoutPbsLabels：垂直标签发生重叠时向外分配 lane=0、1、2……，空闲时立即回到最内侧可用轨道。标签 X 按浏览器实测宽度计算，每标签有独立 SVG 引线，家族着色和触摸长按/拖动原样复用。V2 没有自己的 PBS 标签渲染、排版、引线或手势。

V2 仅把两张 SQL 表当前逻辑行的稳定 logical_id、PBS、parent_id、原始物理 PDF bbox 转成 V1 的 setOverlays/按页 loadPage 公开数据格式，并通过原 focusBlock API 同步 CM6、AG、MD 和 PDF。F02 授权 PDF 地址通过可选 pdfUrlPrefix 注入 V1 组件，在 V1 默认路径不改变的前提下严格读取 V2 当前工作目录。0px Dockview Pane 不触发 PDF.js page-width；V2 先等有效尺寸再加载 PDF，且只有 V2 指定前缀时应用缩放 guard。缩放时仅通过 V1 公开 repaintOverlayPage API 恢复被 PDF.js 重置的页面 DOM。

没有新 SQL 表、假子块或 CMD 内嵌标签：224 个逻辑块自然产生 224 个 PBS，未来审阅后的真实逻辑子块同样由 V1 原生标签支持。同一个物理 bbox 可对应多个不同 PBS，原 V1 组件去重矩形但保留每个标签。WP04 结构修改仍只读，V1 拖动预演未绑定安全事务时释放不更改 SQLite。

## 可复核证据
- 原 V1 tests/lab-ocr-pbs-layout.test.mjs 从 V1 逐字节复制：94 条拥挤数据，最高 lane 58，空位回到内轨。
- 新 tests/v2-pdf-evidence-adapter.test.mjs：22页224块、多轨三重拥挤/松开复用、跨页孩子仍保持原 PDF bbox。
- Chromium：真实 22页 PDF 第一页17个标签，最大 lane 9；iPad-WebKit 第一页17个标签，最大 lane 16。均由原 Lab-OCR 组件提供 data-lane、标签、引线，标签不相互遮挡且不进入 OCR 原框，四窗同步/缩放/0px 恢复测试通过。
- 原 V2 Python 40 单测、SQL与Frame浏览器回归、无新增表、GitHub和公网 SHA 校验；用户真实 iPad Safari 仍须重新加载验收。

## 旧文件状态
docs/v2/WP04_V1_PDF_PBS_SYNC.md 和 docs/v2/WP04_V1_PBS_DIRECT_REUSE.md 描述的是早前错误源（Main/V6双轨）的失败实施，保留作为历史证据。当前规范以本文件和 V2 README 为准。
