# Lab OCR PDF 覆盖框 API · V1（Block / Span）

## 边界与唯一公开接口

在已有 `mountLabOcrPdf` 返回对象上增加 **一个**公开业务 API：

```js
viewer.setOverlays({
  level: 'block', // 'block' | 'span' | 'off'
  loadPage: async (page, level) => ({
    level, page,             // PDF 页码，从 1 开始
    pageSize: [595, 842],  // MinerU JSON 对应页原始宽、高，左上角为 (0, 0)
    boxes: [{id: '...', bbox: [72, 60, 360, 155]}],
  }),
});
```

- PDF 组件只读绘制由调用方提供的页级几何数据；**不直接依赖或访问** MinerU、SQLite、PBS、CMD、工作区路径或用户原文。`loadPage` 是注入回调，不属于 PDF 组件公开 API。接口不提供修改、拖动、排序、抽取文本或数据库写入。
- `off` 关闭覆盖框。PDF 工具条中另有独立的“覆盖框”粒度下拉（关闭／Block／Span），与既有页码、缩放功能互不影响。初次有效书籍绑定后默认 Block，切换 Span 不重新加载 PDF。
- Frame 的 `setPdfOverlays(config)` 只是上述接口的生命周期代理；PDF 尚未懒加载时记录配置，实例挂载后应用，不创建第二个查看器。

## 数据来源与坐标

Lab OCR 业务层提供 `loadPage()`，按需读取已经授权的只读 `GET /labs/lab-ocr/api/ocr/overlays?workspace=...&level=block|span&page=1`。服务端只查询本书 SQLite `block` / `span` 的 `global_page`、`page_size_json`、`block_bbox_json` / `span_bbox_json` 与内部稳定 ID，返回上面的统一几何结构，不返回正文、原始块 JSON 或路径。继续使用 Main 的目录授权、同源 Cookie 和只读 SQLite 连接。

页号在该外部接口为 **1-based**，SQL `global_page` 为 **0-based**；MinerU bbox 格式为 `[x_min, y_min, x_max, y_max]`，左上原点，页面尺寸来自 `page_size_json`。矩形按原始页面宽高换算为 0–100% 的 CSS 坐标，随 PDF.js `.page` 的缩放自然变化，不进行额外重渲染。页宽高比不吻合时拒绝绘制该页，以免显示错误标定。缺失、NaN、宽高非正、超出页面范围的框跳过或按页裁剪。每页最多 5000 个 SQL 覆盖框，超过直接报错，不悄悄丢弃。不存在的页返回空框。

按 PDF 当前页及邻页预取，也通过 IntersectionObserver 覆盖小比例缩放时同时可见的更多页面；换页或滚动后按页请求并缓存。切分／不切分仅移动同一个 PDF.js DOM；不重复请求 PDF 字节。覆盖框 `pointer-events:none`，不干扰 PDF 页面的滚动、文字选择；深色反相滤镜仅作用于 canvas，不影响矢量覆盖框颜色。

## 验收

- `python3 tests/lab-ocr-overlays.test.py`：Block/Span/嵌套块/空框/跨页/原文无修改。
- `python3 tests/lab-ocr-overlays-http.test.py`：授权、禁用写入、按页返回几何、排除正文。
- `node tests/lab-ocr-pdf-viewer.browser.test.mjs`：Chromium + iPad WebKit 检查覆盖框 DOM 百分比位置、Block↔Span↔关闭、缩放、跨页、切分复用、不干扰触摸和文本层。其他 OCR / Frame 回归继续要求 PASS。
