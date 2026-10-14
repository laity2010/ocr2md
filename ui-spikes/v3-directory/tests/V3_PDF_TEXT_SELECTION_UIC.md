# FC-V3-PDF-TEXT-001 / UIC-V3-PDF-TEXT-001

- 功能：PDF.js 原生文字选择与复制（textLayerMode: 1）。
- 初始状态：用户在 V3 工作台选择一本含有嵌入文本的 PDF，PDF 在 MD 标签后方按需预加载；PDF 原文标签可打开。
- 操作：打开“PDF 原文”标签，鼠标拖选/长按文本型 PDF 中的文字，使用系统复制；也可点击 AG 标题定位同一页。
- 需要：PDF 包含真正的 PDF 文本对象（或内嵌 OCR 文本层）。纯图片扫描 PDF 不会凭空生成文字。
- 效果：PDF.js 为已渲染的页面创建透明 `.textLayer`，其文字可用浏览器原生 Selection 选中（进而用浏览器/系统复制）。PDF 页面的外观保持不变；OCR 标题框仍浮在最上层，但 `pointer-events:none` 不阻挡文字选择。
- 副作用：不修改原 PDF、IR、章节 MD；仍按需 Range 读取，不预载全书文本或字节。
- 不变量：分页、缩放、后台加载、iPad raster cap、单次自动定位与手动滚动不回弹继续正常工作；没有 PDF 内置文字的页面不能假称可复制。
- 自动化：`tests/chapterPublishBrowser.cjs` 的 Chromium/WebKit 隔离真实文本 PDF，等待 `.textLayer` 包含 `Page One`，通过原生 DOM Range/Selection 选中并核验文字，同时回归 OCR 高亮框、滚动和章节保存。
- 人工审核：待用户在 iPad Safari 实测长按选取及复制（系统选择菜单属于外部行为）。
