# Lab OCR PDF 覆盖框与 PBS 标签 API · V2（Block / Span）

## 边界与唯一公开接口

在已有 `mountLabOcrPdf` 返回对象上复用配置 API `setOverlays()`，新增独立定位 API `focusBlock()`：

```js
viewer.setOverlays({
  level: 'block', // 'block' | 'span' | 'off'
  blockGroups: null, // null=全部块组，[]=不画；['para_blocks','discarded_blocks']=多选并集
  loadPage: async (page, level) => ({
    level, page,             // PDF 页码，从 1 开始
    pageSize: [595, 842],  // MinerU JSON 对应页原始宽、高，左上角为 (0, 0)
    boxes: [{id:'125', blockId:'125', pbs:'p4b8s1', parentBlockId:'120',
      blockGroup:'para_blocks', blockType:'text', bbox:[72, 60, 360, 155]}],
  }),
});
```

- PDF 组件只读绘制由调用方提供的页级几何数据；**不直接依赖或访问** MinerU、SQLite、PBS、CMD、工作区路径或用户原文。`loadPage` 是注入回调，不属于 PDF 组件公开 API。接口不提供修改、拖动、排序、抽取文本或数据库写入。
- `viewer.setOverlays({blockGroups: ['para_blocks','discarded_blocks']})` 是同一 API 的轻量补丁：不重置用户已选的 Block/Span 粒度，不清空当前页的覆盖框几何缓存。`blockGroups: null` 显示所有块组，空数组隐藏所有框。
- `off` 关闭覆盖框。PDF 工具条中另有独立的“覆盖框”粒度下拉（关闭／Block／Span），与既有页码、缩放功能互不影响。初次有效书籍绑定后默认 Block，切换 Span 不重新加载 PDF。
- Frame 的 `setPdfOverlays(config)` 只是上述接口的生命周期代理；PDF 尚未懒加载时记录配置，实例挂载后应用，不创建第二个查看器。

## 数据来源与坐标

Lab OCR 业务层提供 `loadPage()`，按需读取已经授权的只读 `GET /labs/lab-ocr/api/ocr/overlays?workspace=...&level=block|span&page=1`。服务端只查询本书 SQLite `block` / `span` 的 `global_page`、`page_size_json`、`block_bbox_json` / `span_bbox_json`、`block_type`、`block_group`、`block_id`、`pbs`、`parent_block_id`（Span 经 source key 关联 Block）与内部稳定 ID，返回上面的统一几何结构，不返回正文、原始块 JSON 或路径。继续使用 Main 的目录授权、同源 Cookie 和只读 SQLite 连接。

页号在该外部接口为 **1-based**，SQL `global_page` 为 **0-based**；MinerU bbox 格式为 `[x_min, y_min, x_max, y_max]`，左上原点，页面尺寸来自 `page_size_json`。矩形按原始页面宽高换算为 0–100% 的 CSS 坐标，随 PDF.js `.page` 的缩放自然变化，不进行额外重渲染。页宽高比不吻合时拒绝绘制该页，以免显示错误标定。缺失、NaN、宽高非正、超出页面范围的框跳过或按页裁剪。每页最多 5000 个 SQL 覆盖框，超过直接报错，不悄悄丢弃。不存在的页返回空框。

按 PDF 当前页及邻页预取，也通过 IntersectionObserver 覆盖小比例缩放时同时可见的更多页面；换页或滚动后按页请求并缓存。切分／不切分仅移动同一个 PDF.js DOM；不重复请求 PDF 字节。覆盖框 `pointer-events:none`，不干扰 PDF 页面的滚动、文字选择；深色反相滤镜仅作用于 canvas，不影响矢量覆盖框颜色。

## 验收

- `python3 tests/lab-ocr-overlays.test.py`：Block/Span/嵌套块/空框/跨页/原文无修改。
- `python3 tests/lab-ocr-overlays-http.test.py`：授权、禁用写入、按页返回几何、排除正文。
- `node tests/lab-ocr-pdf-viewer.browser.test.mjs`：Chromium + iPad WebKit 检查覆盖框 DOM 百分比位置、Block↔Span↔关闭、缩放、跨页、切分复用、不干扰触摸和文本层。其他 OCR / Frame 回归继续要求 PASS。

## 统一全局设置（2026-11-12）

已复用现有设置组件注册 `pdf.overlay.borderWidth`（0.25–3 px，步进 0.25，默认 **0.75 px**）和 `pdf.overlay.transparency`（0–95%，步进 5，默认 **65%**，数值越高越透明）。二者对 Block、Span 均生效；原文、覆盖框 bbox、坐标、比例均不改变。只修改 PDF 视窗容器的 CSS 变量，变更实时更新已显示覆盖框，不触发 PDF 或 SQLite 重新读取。由现有 CMD 设置模块的 `settings.changed` 通知应用，现有全局保存按钮负责持久化。Lab Frame 和 Main 不注册这两项。

## AG 块组 → PDF 显示过滤（2026-11-12）

- **勘误**：之前版本把 AG 的 `block_type` 当成 PDF 筛选依据，这是错误的。应使用 SQL 的 `block_group`，AG 中文列名为「块组」；`block_type`（块类型）仍是独立可过滤字段，**但不控制覆盖框**。三个 SQL 视图中的 `block_group` 列统一改名「块组」，仅 AG **SQLite → block** 的块组筛选向 PDF 发布选择。
- AG Grid 复用原有 `EnumCheckboxFilter`（`all`、单选、空选、多选），通过其已注册的公共 `onFilterChanged` Port 将 `model.block_group.values` 通知 lab-ocr 业务层，后者调用 Frame 公共代理 `setPdfOverlays({blockGroups})`。`null` 代表 all，`[]` 代表空选；其他列筛选不改变 PDF，切换其他 SQL 表时重置。PDF 不访问 AG 私有状态／DOM 或 SQLite。
- 每页只读 API 的 `boxes` 每项增加 `blockGroup`（取自对应 `block`/`span` 表的 `block_group`），保留先前的 `blockType` 供其他显示用途，不改任何表结构，不重写原始 JSON；Block 与 Span 绘制都采用相同块组筛选集。
- **all / 多选＝所选块组的集合并集，并非逐组叠画**。每页、每粒度始终只存在一个覆盖层，筛选时从缓存几何重建并替换，去除重复 ID、完全相同坐标、以及不同块组之间 IoU≥0.94 的近乎相同矩形（处理预处理与正文块略微错位）。跨块组重复时按 `para_blocks` → `discarded_blocks` → `preproc_blocks` 优先保留正文版本。真实的嵌套、包含和部分相交块仍显示，不以任意交叉误判为重复。
- 块组选项变化只重画浏览器缓存，不重新取 SQL 几何或 PDF 字节、不重置页码／缩放／Block-Span 粒度；换页仍按页查询，缩放后从缓存恢复。
- 定向验收：`tests/lab-ocr-overlays.test.py` 和 `tests/lab-ocr-overlays-http.test.py` 验证组字段、来源与访问权限；`tests/lab-ocr-overlay-filter.browser.test.mjs` 在 Chromium 和 iPad WebKit 用**真实 AG 块组复选菜单**测全选、空选、单选、多选、跨组精准／近似重合去重、嵌套保留、块类型筛选独立、Block/Span、缩放、翻页、无重查。

## PBS 标签、去重身份与多窗定位（2026-11-12）

- **仅 Block 粒度显示 PBS 标签**。Block 的只读页面投影增加 `blockId`（`block.block_id`，字符串）、`pbs`（人类可读）、`parentBlockId`（父块数字 ID 的字符串或 null）；Span 通过 `span.block_id → block.source_block_key` 只读关联同一组身份，不显示逐 Span 的重复 PBS 标签。`id` 仍是该粒度原始矩形身份，不能拿 `pbs` 当唯一 ID。数据库字段、MinerU JSON、CMD 原文均不修改，API 不返回正文。
- PDF 继续使用单一 `setOverlays(config)` 配置注入：可附加 `onBlockSelect({blockId,pbs,page,blockGroup})` 回调，通知调用方**用户点击**的 Block，其他内部重绘绝不触发选择回调。公共 `focusBlock({id,page})` 在 AG 发起定位时设定 selected Block ID、必要时切回 Block 粒度、跳页、定位已缓存或待加载的对应 bbox，不修改数据或重复载入 PDF。懒装配的 PDF 适配器转发这两个能力。
- Block 页级去重后每一个视觉代表框持有**完整别名 `blockId` 集合**，包括跨块组完全相同或 IoU≥0.94 的略错位源矩形。仅绘制优先级最高的一份框和 PBS 标签，但 AG 点击任一对应原 Block ID 均高亮这份代表。框与标签共用选中状态，选择不会改变块组过滤，也不会触发 SQL 重查。
- PBS 是带引线的**独立不透明交互层**，覆盖框仍保持原有的透明度和 `pointer-events:none`；只读标签固定 23px 高，按离版面较近的左／右轨道放在纸页外的侧栏，页面适宽缩放会为侧栏预留空间。引线指向原框边缘。子块通过 `parentBlockId` 改用区别颜色。标签按原始纵向锚点放置；若内侧已有标签占据相同高度，则**只向外移一个或多个水平轨道，不改变标签纵坐标，也不合并为 `+N`**。后续标签只要内侧高度空闲就立刻回到原轨道。左右两侧独立计算，每个可见去重 Block 始终有自己可点击的 PBS 标签；引线随水平距离伸长。
- Frame 暴露两个**受控语义端口**：`focusPdfBlock({id,page})` 代理 PDF 公共 `focusBlock`；`selectSqlRowById({field:'block_id',id})` 通过 AG 组件端口定位、聚焦/选中行并送 CM6 展示同一 SQL 行，不操作 AG 私有 DOM。AG 如有不相关列过滤挡住了目标，保留 `block_group` 筛选而清除其他隐藏目标的条件。Lab OCR 在 AG Block 行点击时调用前者；PDF 点击 PBS 时调用后者，如果 Block 表尚未打开则复用 `openSql('block')` 打开并选中目标。
- 验收：Python `lab-ocr-overlays.test.py` / `lab-ocr-overlays-http.test.py` 核实原生身份、父子、Span 归属与授权；Node `lab-ocr-pbs-layout.test.mjs` 直接测试多轨避让、内轨回归及全部独立标签；`lab-ocr-pbs-link.browser.test.mjs` 在 Chromium 和 iPad WebKit 用真实 AG、PDF.js 测标签显示、纸页外定位、缩放、分栏、别名高亮、AG↔PDF 跨页和密集多轨可点击标签。原有 PDF/块组筛选/Frame/授权/OCR 回归保持通过。

## PBS 多轨横向避让（2026-11-12，替代密集收纳）

- `layoutPbsLabels()` 按页面分左／右两边，**每个可见 Block 单独计算**，不生成折叠标签或展开列表。各侧按 bbox 的原始中点 `anchorY` 自上而下排序；标签高度保持 23px，顶部位置取 `anchorY−11.5px`（页边做必要钳制），**绝不为消除相互碰撞而移动 Y**。
- 每侧维护从页边向外的可用轨道：新标签总是选择当前纵向区间可容纳它的**最内层轨道**，不存在空位才新增最外层轨道。已拥挤期间第二、第三个标签逐轨向外，随后内轨恢复空位就立即回到靠近页面的位置，不会被之前外移的标签永久挤走。不同轨道水平不重合，同轨标签最小垂直间隔 3px。左右完全独立。
- 对应标签的引线从外移后的标签内侧水平延伸至页边，再到覆盖框原始 bbox 端点；SVG 引线无需变更 SQLite 坐标。PDF.js 页外使用实际可横向滚动的左右留白，动态按最远轨道扩大 `pdfViewer` padding，避免远处标签被裁剪或挤进 PDF 正文。页面适宽时仍预留初始双侧 88px，超过屏幕时用户可横向滚动而不是丢弃标签。标签可在 iPad 上单击定位 AG。
- `tests/lab-ocr-pbs-layout.test.mjs` 测试所有 94 个高密标签均保留、左右独立、同轨无碰撞、拥堵后的内轨回归；`tests/lab-ocr-pbs-link.browser.test.mjs` 在 Chromium/iPad WebKit 验证 62 个独立标签、水平外移、scrollWidth、点击最外侧标签的 AG 定位和旧 Block/Span/切分行为。

## PBS 标签边框按文本宽度适配（2026-11-12）

- 标签不再固定 `78px` 宽，统一使用浏览器 `width:max-content` 与横向各 `4px` 的内边距、`1px` 边框；字体、23px 高、父子样式、选中高亮与可点击性不改变。短 PBS 收窄，超长 PBS 完整显示且不截断。
- PBS 布局仍只根据纵向拥挤程度选择由内向外的轨道。页面层先放入 DOM 并测量各标签实际 `offsetWidth`，每条轨道按其**最长标签**预留横向空间，但每个标签自身框宽仍只包住自己的字；这样不依赖字体字数估算，避免不同长度交叉碰撞。左右分侧独立布局。
- SVG 引线起点沿着标签**靠近 PDF 的真实边缘**重算；需要的页面侧栏宽度取各轨道最外标签的实际宽度而非固定步进，并继续允许水平滚动。既有 Block ID 双向定位、块组过滤、覆盖框去重与 Span 均不改变。
- `tests/lab-ocr-pbs-link.browser.test.mjs` 在 Chromium 与 iPad WebKit 用 Range 测量字形真实占宽，断言边框超出文字的宽度仅约 `8–10px`，长标签宽于短标签、超过原 `78px` 时不截字，密集不同宽度的标签在多轨道上无重叠，远侧标签可点击定位。

## PBS 同页相邻标签重叠防线（2026-11-12）

- 针对报告的 `p11b0`、`p11b01` 等相邻 PBS 标签，新一轮布局**先插入 DOM，再用浏览器 `getBoundingClientRect()` 获取实际宽高**，转成页面布局坐标。按所在侧与原始纵坐标逐一寻找最靠近页面、却与已有标签实际矩形不相交的水平位置；同侧两标签高度相交时向外移，之后纵向空间空闲立刻回内侧。不修改标签纵坐标，不归并标签，不改变 Block ID / PBS 数据与覆盖框去重。SVG 引线起点、页面侧栏实际宽度随重排更新。
- 每页的 PBS 标签由一个 `ResizeObserver` 在**字体后加载、屏幕字体缩放、CSS 字形宽度变化**时自动重新测量。每次 PDF 页重绘前断开旧标签的观察，卸载或切换文件时清理，避免旧 DOM 的重复定位干扰。
- 回归样本使用自生成 **11 页 PDF**，第 11 页分别提供 `p11b0`、`p11b01`、`p11b02`、`p11b3`、`p11b4`、`p11b05` 六个独立框，其中前几项几何近乎重合；分别检验首绘、注入字体变大、150% PDF 缩放时所有标签真实 DOM 矩形都不相交，并在 iPad WebKit / Chromium 点击 `p11b01` 后通过稳定 Block ID 定位 AG。测试在忽略文件 `.runtime/pbs-overlap-evidence/` 保留验证截图。**该样本是构造的回归夹具，不是用户原 PDF 的截图**，原文书籍需发布后用户再核对。

## PBS 父子同色系与整组高亮（2026-11-12）

- PDF 父（独立）Block 标签与框保持深绿色、实线；子块标签使用同系偏浅绿色与虚线边框，对应子块覆盖框和引线也使用浅绿/虚线样式。统一绿色系代替此前子块的棕色系；22–23px 的标签点击尺寸与按文本宽度适配保持不变。
- 点击父块 PBS 标签或从 AG 定位一个父 Block 时，**被选中的父块直接高亮**，其递归后代（子块、孙块……）的**标签和 PDF bbox 一同高亮**，但采用略浅的绿色以区分选中核心对象。点击子块时只选中该子块并联动它自己的后代，不反向高亮父块或兄弟块，不改变 AG 唯一选中行。
- 身份使用 `blockId`/`parentBlockId` 建立只读 `Map`，`pbs` 仅用于显示，编号变化不会破坏关系。每次按页返回覆盖框数据时合并关系（包括来源块组未选中的 ID）；显示仍严格遵守块组筛选。几何去重时保留代表框全部原始 Block ID 别名，选中父块或别名后都能找到正确的可见子孙。跨页后代在相关页面被加载/渲染后高亮，不要求预取整本 SQLite。缺失、循环或自引用的父关系必须安全结束。
- 新模块内部纯函数 `indexBlockParents(parentMap,boxes)` 与 `blockHighlight(ids,selectedId,parents)` 放在 `ui/lab-ocr/pbs-family.js`，由直接单元测试 `tests/lab-ocr-pbs-family.test.mjs` 覆盖递归、反向/兄弟隔离、去重别名、重命名 PBS 以及坏链路安全。`tests/lab-ocr-pbs-link.browser.test.mjs` 在 Chromium/iPad WebKit 使用真 PDF.js/AG 和模拟多页父子结构，验证父/子配色、PDF 标签与覆盖框全部后代高亮、跨页、子块单选、AG 反向定位、去重来源、字体调整与缩放。
- 高亮时**维持 1px 边框宽**，不改变标签盒子大小（用描边外阴影表现醒目程度）；轨道布局使用 `offsetWidth/offsetHeight/offsetTop` 一致的页面布局像素系，规避 iPad WebKit PDF 变换尺度与 DOM 矩形混用造成的密集标签二次重叠。

## lab-ocr 默认 AG Block 与 para 块组（2026-11-12）

- 在保存过的资料目录成功初始化完 SQLite `block` 与 `span` 后，lab-ocr 默认打开 **SQLite → block**，而不是空 AG 或 `minerujson`；新绑定目录并保存也进入 Block。未绑定目录仍打开全局设置；加载中用户主动选择其他导航，则用户选择优先于自动入口。
- 初始 Block AG `block_group` 列的真实 `EnumCheckboxFilter` 模型为 `{block_group:{values:['para_blocks']}}`；复选菜单中只有 `para_blocks` 勾选、`all` 未勾。Frame 公共 `showSqlRows(rows,columns,{initialFilterModel})` 只在 AG 列/行初始化后调用 AG Grid 公开 `setFilterModel()`，由原始过滤器实际持有状态和触发既有 `onFilterChanged`，没有制作平行的过滤控件或直接操作 AG DOM。
- PDF `setPdfOverlays({blockGroups:['para_blocks']})` 与 AG 同步，首次打开只绘制 `para_blocks` 的 Block/Span 几何；后续人工多选、空选、all、切换 Block/Span 与父子高亮保持可用。`openSql('block',{selectedId})` 从其它视图应 PDF 标签定位时，以被点选 Block 的来源组设置初始过滤，避免目标行被默认 para 隐藏。
- SQLite、MinerU、PBS、Block ID 和原有用户数据完全不变；仅初始化及当前视图状态改变。`tests/lab-ocr-sample-flow.browser.test.mjs` 覆盖未绑定→保存→自动 Block／重载默认，`tests/lab-ocr-overlay-filter.browser.test.mjs` 覆盖 AG 初始勾选及 PDF 联动，`tests/lab-ocr-pbs-link.browser.test.mjs` 覆盖用户改 all 后的跨块组几何去重与双向定位。
