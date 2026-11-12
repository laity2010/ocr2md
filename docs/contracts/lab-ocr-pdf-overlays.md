# Lab OCR PDF 覆盖框 API · V1（Block / Span）

## 边界与唯一公开接口

在已有 `mountLabOcrPdf` 返回对象上增加 **一个**公开业务 API：

```js
viewer.setOverlays({
  level: 'block', // 'block' | 'span' | 'off'
  blockTypes: null, // null=全部类型，[]=不画；['text','title']=多选并集
  loadPage: async (page, level) => ({
    level, page,             // PDF 页码，从 1 开始
    pageSize: [595, 842],  // MinerU JSON 对应页原始宽、高，左上角为 (0, 0)
    boxes: [{id: '...', blockType: 'text', bbox: [72, 60, 360, 155]}],
  }),
});
```

- PDF 组件只读绘制由调用方提供的页级几何数据；**不直接依赖或访问** MinerU、SQLite、PBS、CMD、工作区路径或用户原文。`loadPage` 是注入回调，不属于 PDF 组件公开 API。接口不提供修改、拖动、排序、抽取文本或数据库写入。
- `viewer.setOverlays({blockTypes: ['text','table']})` 是同一 API 的轻量补丁：不重置用户已选的 Block/Span 粒度，不清空当前页的覆盖框几何缓存。`blockTypes: null` 显示所有类型，空数组隐藏所有框。
- `off` 关闭覆盖框。PDF 工具条中另有独立的“覆盖框”粒度下拉（关闭／Block／Span），与既有页码、缩放功能互不影响。初次有效书籍绑定后默认 Block，切换 Span 不重新加载 PDF。
- Frame 的 `setPdfOverlays(config)` 只是上述接口的生命周期代理；PDF 尚未懒加载时记录配置，实例挂载后应用，不创建第二个查看器。

## 数据来源与坐标

Lab OCR 业务层提供 `loadPage()`，按需读取已经授权的只读 `GET /labs/lab-ocr/api/ocr/overlays?workspace=...&level=block|span&page=1`。服务端只查询本书 SQLite `block` / `span` 的 `global_page`、`page_size_json`、`block_bbox_json` / `span_bbox_json`、`block_type` 与内部稳定 ID，返回上面的统一几何结构，不返回正文、原始块 JSON 或路径。继续使用 Main 的目录授权、同源 Cookie 和只读 SQLite 连接。

页号在该外部接口为 **1-based**，SQL `global_page` 为 **0-based**；MinerU bbox 格式为 `[x_min, y_min, x_max, y_max]`，左上原点，页面尺寸来自 `page_size_json`。矩形按原始页面宽高换算为 0–100% 的 CSS 坐标，随 PDF.js `.page` 的缩放自然变化，不进行额外重渲染。页宽高比不吻合时拒绝绘制该页，以免显示错误标定。缺失、NaN、宽高非正、超出页面范围的框跳过或按页裁剪。每页最多 5000 个 SQL 覆盖框，超过直接报错，不悄悄丢弃。不存在的页返回空框。

按 PDF 当前页及邻页预取，也通过 IntersectionObserver 覆盖小比例缩放时同时可见的更多页面；换页或滚动后按页请求并缓存。切分／不切分仅移动同一个 PDF.js DOM；不重复请求 PDF 字节。覆盖框 `pointer-events:none`，不干扰 PDF 页面的滚动、文字选择；深色反相滤镜仅作用于 canvas，不影响矢量覆盖框颜色。

## 验收

- `python3 tests/lab-ocr-overlays.test.py`：Block/Span/嵌套块/空框/跨页/原文无修改。
- `python3 tests/lab-ocr-overlays-http.test.py`：授权、禁用写入、按页返回几何、排除正文。
- `node tests/lab-ocr-pdf-viewer.browser.test.mjs`：Chromium + iPad WebKit 检查覆盖框 DOM 百分比位置、Block↔Span↔关闭、缩放、跨页、切分复用、不干扰触摸和文本层。其他 OCR / Frame 回归继续要求 PASS。

## 统一全局设置（2026-11-12）

已复用现有设置组件注册 `pdf.overlay.borderWidth`（0.25–3 px，步进 0.25，默认 **0.75 px**）和 `pdf.overlay.transparency`（0–95%，步进 5，默认 **65%**，数值越高越透明）。二者对 Block、Span 均生效；原文、覆盖框 bbox、坐标、比例均不改变。只修改 PDF 视窗容器的 CSS 变量，变更实时更新已显示覆盖框，不触发 PDF 或 SQLite 重新读取。由现有 CMD 设置模块的 `settings.changed` 通知应用，现有全局保存按钮负责持久化。Lab Frame 和 Main 不注册这两项。

## AG Block Type → PDF 显示过滤（2026-11-12）

- `lab-ocr` 的 AG **SQLite → block** 视图使用原有 `EnumCheckboxFilter` 的 `block_type` 列；筛选组件不认识 PDF。AG 公共 Port 的 `onFilterChanged` 只把原生 `grid.getFilterModel()` 交给 Lab 业务层，由后者取出 `model.block_type.values`（`null` 代表全选，不是空选）。页码及其他列的筛选不改变 PDF 的覆盖框类型。切换到其他 SQL 表时重置 Block 类型过滤；暂时进入全局设置不会清空已有 Block 筛选。
- Lab 业务层以现有公开 `setPdfOverlays({blockTypes})` 代理 PDF 的 `setOverlays()`，不新增 PDF 业务 API，也不让 PDF 读取 AG 私有状态；Block 和 Span 框均通过自身的 `blockType` 字段按相同过滤集显示。
- **多选是集合并集，不是层叠绘制**：一个页面、一个粒度只有一层覆盖框；每次从同一份缓存几何构造过滤结果并替换该页面的层。重复 Block ID、以及不同 ID 但矩形坐标相同的框，仅画一次。真实不相同的边界仍逐个显示，不武断删除局部相交块。
- 过滤仅在浏览器中重绘已缓存页，不重新读取 SQLite 或 PDF 字节、不重置页码／缩放／Block-Span 粒度。尚未缓存的页仍按需读取；PDF.js 缩放后若替换了页面 DOM，在 `pagerendered` 事件中从缓存恢复当前过滤层。
- 直接测试：`tests/lab-ocr-overlays.test.py`、`tests/lab-ocr-overlays-http.test.py` 检查返回的 Block 类型；`tests/lab-ocr-overlay-filter.browser.test.mjs` 在 Chromium、iPad WebKit 对真正 AG Block Type 复选菜单验证全选／空选／多选／取消、去重、Span 继承、缩放与跨页，以及请求计数不变。
