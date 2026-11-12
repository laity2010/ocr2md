# Lab OCR PDF 覆盖框与 PBS 标签 API · V2（Block / Span）

## 边界与唯一公开接口

在已有 `mountLabOcrPdf` 返回对象上复用配置 API `setOverlays()`，新增独立定位 API `focusBlock()`：

```js
viewer.setOverlays({
  level: 'block', // 'block' | 'span' | 'off'
  blockGroups: ['para_blocks'], // Lab OCR 固定；底层通用 PDF 组件仍支持其它配置
  loadPage: async (page, level) => ({
    level, page,             // PDF 页码，从 1 开始
    pageSize: [595, 842],  // MinerU JSON 对应页原始宽、高，左上角为 (0, 0)
    boxes: [{id:'125', blockId:'125', pbs:'p4b8s1', parentBlockId:'120',
      blockGroup:'para_blocks', blockType:'text', bbox:[72, 60, 360, 155]}],
  }),
});
```

- PDF 组件只读绘制由调用方提供的页级几何数据；**不直接依赖或访问** MinerU、SQLite、PBS、CMD、工作区路径或用户原文。`loadPage` 是注入回调，不属于 PDF 组件公开 API。WCP41 新增只输出 `onBlockDragIntent` 的拖动预演回调与 `invalidateOverlayPage` 单页局部刷新；PDF 组件本身仍不执行结构写入或修改原始覆盖框。SQLite 事务及 Undo 由业务 API 负责，详见 `lab-ocr-block-edit.md`。
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

## Block/Span 只处理 para_blocks（WCP40，取代旧多块组过滤）

- 原始 MinerU JSON 及 `minerujson` 溯源表保留全部块组，保持原始字节、来源和恢复能力；新的 **SQLite `block`、`span` 派生表仅包含 `para_blocks`**，包括该组的全部嵌套子块。原有三组派生表在相同输入 SHA 下采用事务原位删除非 para 行，保留 para 的整数 BlockID、PBS 修改与 Span ID；重新生成时继续按原始全组顺序预留 BlockID 序号，只写入 para 行，避免旧 ID 漂移。
- `GET rows?table=block|span` 与 `GET overlays?level=block|span` 均在 SQL 层使用 `block_group='para_blocks'`，即使旧三组表尚未迁移也不会泄漏其它组。Span 中的 `source_block_key` 仍按原值关联 para Block；不改变来源 JSON。
- Lab OCR `workflow` 永远给现有 PDF 公共 API 注入 `setPdfOverlays({blockGroups:['para_blocks']})`；无多组/all/空组选择通路。AG 的 Block/Span 表移除冗余「块组」列/过滤菜单；其它列筛选只影响 AG，不修改 PDF。原始 minerujson 仍可检查组信息，但它不是 Block 操作对象。
- 单个覆盖层、相同 bbox 去重、不同 PBS（含 s1）各自标签、橙色实线父子高亮、跨窗定位与缩放保留。用于复用的底层 PDF 组件依然允许外部调用方传入通用 `blockGroups` 过滤配置，**但 Lab OCR 业务层不再开放此能力**。
- 验收：`tests/lab-ocr-para-only.test.py`、Block/Span/Overlay Python 测试、`tests/lab-ocr-overlay-filter.browser.test.mjs`（故意提供混合旧组夹具），以及 PBS、初始导航等 Chromium / iPad WebKit 回归。

## PBS 标签、去重身份与多窗定位（2026-11-12）

- **仅 Block 粒度显示 PBS 标签**。Block 的只读页面投影增加 `blockId`（`block.block_id`，字符串）、`pbs`（人类可读）、`parentBlockId`（父块数字 ID 的字符串或 null）；Span 通过 `span.block_id → block.source_block_key` 只读关联同一组身份，不显示逐 Span 的重复 PBS 标签。`id` 仍是该粒度原始矩形身份，不能拿 `pbs` 当唯一 ID。数据库字段、MinerU JSON、CMD 原文均不修改，API 不返回正文。
- PDF 继续使用单一 `setOverlays(config)` 配置注入：可附加 `onBlockSelect({blockId,pbs,page,blockGroup})` 回调，通知调用方**用户点击**的 Block，其他内部重绘绝不触发选择回调。公共 `focusBlock({id,page})` 在 AG 发起定位时设定 selected Block ID、必要时切回 Block 粒度、跳页、定位已缓存或待加载的对应 bbox，不修改数据或重复载入 PDF。懒装配的 PDF 适配器转发这两个能力。
- Block 页级去重后每一个视觉代表框持有**完整别名 `blockId` 集合**，包括跨块组完全相同或 IoU≥0.94 的略错位源矩形。几何覆盖框仍只绘制优先级最高的一份，AG 点击任一对应原 Block ID 均高亮这份代表；**PBS 标签独立于框去重**：同一页不同 PBS 即使 bbox 完全相同（常见父块与 `s1`、兄弟子块），也各有独立标签、引线和点击 Block ID；仅跨块组相同 PBS 的别名共用一个标签。选中不改变块组过滤，也不触发 SQL 重查。
- PBS 是带引线的**独立不透明交互层**，覆盖框仍保持原有的透明度和 `pointer-events:none`；只读标签固定 23px 高，按离版面较近的左／右轨道放在纸页外的侧栏，页面适宽缩放会为侧栏预留空间。引线指向原框边缘。子块通过 `parentBlockId` 改用区别颜色。标签按原始纵向锚点放置；若内侧已有标签占据相同高度，则**只向外移一个或多个水平轨道，不改变标签纵坐标，也不合并为 `+N`**。后续标签只要内侧高度空闲就立刻回到原轨道。左右两侧独立计算，每个可见去重 Block 始终有自己可点击的 PBS 标签；引线随水平距离伸长。
- Frame 暴露两个**受控语义端口**：`focusPdfBlock({id,page})` 代理 PDF 公共 `focusBlock`；`selectSqlRowById({field:'block_id',id})` 通过 AG 组件端口定位、聚焦/选中行并送 CM6 展示同一 SQL 行，不操作 AG 私有 DOM。AG 如有不相关列筛选挡住目标，由 AG 公共选择端口处理；Block/Span 已不提供块组筛选。Lab OCR 在 AG Block 行点击时调用前者；PDF 点击 PBS 时调用后者，如果 Block 表尚未打开则复用 `openSql('block')` 打开并选中目标。
- 验收：Python `lab-ocr-overlays.test.py` / `lab-ocr-overlays-http.test.py` 核实原生身份、父子、Span 归属与授权；Node `lab-ocr-pbs-layout.test.mjs` 直接测试多轨避让、内轨回归及全部独立标签；`lab-ocr-pbs-link.browser.test.mjs` 在 Chromium 和 iPad WebKit 用真实 AG、PDF.js 测标签显示、纸页外定位、缩放、分栏、别名高亮、AG↔PDF 跨页和密集多轨可点击标签。原有 PDF/固定 para/Frame/授权/OCR 回归保持通过。

## PBS 多轨横向避让（2026-11-12，替代密集收纳）

- `layoutPbsLabels()` 按页面分左／右两边，**每个可见 Block 单独计算**，不生成折叠标签或展开列表。各侧按 bbox 的原始中点 `anchorY` 自上而下排序；标签高度保持 23px，顶部位置取 `anchorY−11.5px`（页边做必要钳制），**绝不为消除相互碰撞而移动 Y**。
- 每侧维护从页边向外的可用轨道：新标签总是选择当前纵向区间可容纳它的**最内层轨道**，不存在空位才新增最外层轨道。已拥挤期间第二、第三个标签逐轨向外，随后内轨恢复空位就立即回到靠近页面的位置，不会被之前外移的标签永久挤走。不同轨道水平不重合，同轨标签最小垂直间隔 3px。左右完全独立。
- 对应标签的引线从外移后的标签内侧水平延伸至页边，再到覆盖框原始 bbox 端点；SVG 引线无需变更 SQLite 坐标。PDF.js 页外使用实际可横向滚动的左右留白，动态按最远轨道扩大 `pdfViewer` padding，避免远处标签被裁剪或挤进 PDF 正文。页面适宽时仍预留初始双侧 88px，超过屏幕时用户可横向滚动而不是丢弃标签。标签可在 iPad 上单击定位 AG。
- `tests/lab-ocr-pbs-layout.test.mjs` 测试所有 94 个高密标签均保留、左右独立、同轨无碰撞、拥堵后的内轨回归；`tests/lab-ocr-pbs-link.browser.test.mjs` 在 Chromium/iPad WebKit 验证 62 个独立标签、水平外移、scrollWidth、点击最外侧标签的 AG 定位和旧 Block/Span/切分行为。

## PBS 标签边框按文本宽度适配（2026-11-12）

- 标签不再固定 `78px` 宽，统一使用浏览器 `width:max-content` 与横向各 `4px` 的内边距、`1px` 边框；字体、23px 高、父子样式、选中高亮与可点击性不改变。短 PBS 收窄，超长 PBS 完整显示且不截断。
- PBS 布局仍只根据纵向拥挤程度选择由内向外的轨道。页面层先放入 DOM 并测量各标签实际 `offsetWidth`，每条轨道按其**最长标签**预留横向空间，但每个标签自身框宽仍只包住自己的字；这样不依赖字体字数估算，避免不同长度交叉碰撞。左右分侧独立布局。
- SVG 引线起点沿着标签**靠近 PDF 的真实边缘**重算；需要的页面侧栏宽度取各轨道最外标签的实际宽度而非固定步进，并继续允许水平滚动。既有 Block ID 双向定位、固定 para 过滤、覆盖框去重与 Span 均不改变。
- `tests/lab-ocr-pbs-link.browser.test.mjs` 在 Chromium 与 iPad WebKit 用 Range 测量字形真实占宽，断言边框超出文字的宽度仅约 `8–10px`，长标签宽于短标签、超过原 `78px` 时不截字，密集不同宽度的标签在多轨道上无重叠，远侧标签可点击定位。

## PBS 同页相邻标签重叠防线（2026-11-12）

- 针对报告的 `p11b0`、`p11b01` 等相邻 PBS 标签，新一轮布局**先插入 DOM，再用浏览器 `getBoundingClientRect()` 获取实际宽高**，转成页面布局坐标。按所在侧与原始纵坐标逐一寻找最靠近页面、却与已有标签实际矩形不相交的水平位置；同侧两标签高度相交时向外移，之后纵向空间空闲立刻回内侧。不修改标签纵坐标，不归并标签，不改变 Block ID / PBS 数据与覆盖框去重。SVG 引线起点、页面侧栏实际宽度随重排更新。
- 每页的 PBS 标签由一个 `ResizeObserver` 在**字体后加载、屏幕字体缩放、CSS 字形宽度变化**时自动重新测量。每次 PDF 页重绘前断开旧标签的观察，卸载或切换文件时清理，避免旧 DOM 的重复定位干扰。
- 回归样本使用自生成 **11 页 PDF**，第 11 页分别提供 `p11b0`、`p11b01`、`p11b02`、`p11b3`、`p11b4`、`p11b05` 六个独立框，其中前几项几何近乎重合；分别检验首绘、注入字体变大、150% PDF 缩放时所有标签真实 DOM 矩形都不相交，并在 iPad WebKit / Chromium 点击 `p11b01` 后通过稳定 Block ID 定位 AG。测试在忽略文件 `.runtime/pbs-overlap-evidence/` 保留验证截图。**该样本是构造的回归夹具，不是用户原 PDF 的截图**，原文书籍需发布后用户再核对。

## PBS 父子配色（依 Main）与整组高亮（2026-11-12）

- PBS 父块标签直接采用 Main 的灰绿色标签（`rgba(39,63,60,.94)`、边框 `#76a497`）；PBS 子块标签采用 Main 的蓝灰色（`rgba(34,56,70,.95)`、边框 `#8ab5ca`）；父／子边框均始终为实线。引线分别采用 Main `#8cb6a3`（父）和 `#8ab5da`（子），也均为实线。23px 的标签点击高度与按文本宽度适配保持不变；PDF 覆盖框颜色由独立的橙色高亮规则负责。
- 点击父块 PBS 标签或从 AG 定位一个父 Block 时，**被选中的父块直接高亮**，其递归后代（子块、孙块……）的**标签和 PDF bbox 一同高亮**。PBS 标签仍保留 Main 父／子原底色和实线边框，**全部选中家族标签（直接与随动）使用完全相同的金色 2px 实线外圈 `box-shadow:0 0 0 2px #eec45b`**，不再对子孙使用较细较淡的 1px 提示；PDF 框继续使用独立的橙色高亮。点击子块时只选中该子块并联动它自己的后代，不反向高亮父块或兄弟块，不改变 AG 唯一选中行。
- 身份使用 `blockId`/`parentBlockId` 建立只读 `Map`，`pbs` 仅用于显示，编号变化不会破坏关系。每次按页返回覆盖框数据时合并关系（包括来源块组未选中的 ID）；显示仍严格遵守块组筛选。几何去重时保留代表框全部原始 Block ID 别名，选中父块或别名后都能找到正确的可见子孙。跨页后代在相关页面被加载/渲染后高亮，不要求预取整本 SQLite。缺失、循环或自引用的父关系必须安全结束。
- 新模块内部纯函数 `indexBlockParents(parentMap,boxes)` 与 `blockHighlight(ids,selectedId,parents)` 放在 `ui/lab-ocr/pbs-family.js`，由直接单元测试 `tests/lab-ocr-pbs-family.test.mjs` 覆盖递归、反向/兄弟隔离、去重别名、重命名 PBS 以及坏链路安全。`tests/lab-ocr-pbs-link.browser.test.mjs` 在 Chromium/iPad WebKit 使用真 PDF.js/AG 和模拟多页父子结构，验证父/子配色、PDF 标签与覆盖框全部后代高亮、跨页、子块单选、AG 反向定位、去重来源、字体调整与缩放。
- 高亮时**维持 1px 边框宽**，不改变标签盒子大小（用描边外阴影表现醒目程度）；轨道布局使用 `offsetWidth/offsetHeight/offsetTop` 一致的页面布局像素系，规避 iPad WebKit PDF 变换尺度与 DOM 矩形混用造成的密集标签二次重叠。


## lab-ocr 启动 Block 与固定 para（WCP40）

- 有效资料目录完成 `minerujson` 导入、para-only Block 和 Span 派生后，默认打开 **SQLite → block**；新绑定目录保存后也自动进入 Block。未绑定目录仍显示全局设置，用户主动导航的选择不被后台检查覆盖。
- Block / Span 的 AG 不提供块组列及筛选，且 PDF Block / Span 只能绘制 para 覆盖框。无需 `initialFilterModel`，也不订阅块组过滤变化；其它 AG 列仍有原有 EnumCheckboxFilter。PDF 标签选中时依稳定 BlockID 定位，不会调用跨组导航。
- `tests/lab-ocr-sample-flow.browser.test.mjs` 覆盖未绑定→保存→Block 默认与重载，`tests/lab-ocr-overlay-filter.browser.test.mjs` 覆盖只含 para、不出现 group 过滤、Block/Span、缩放和跨页防泄漏。

## PDF Block 橙色高亮与 PBS 父子标签颜色分离（2026-11-12）

- 选中 **PDF 块覆盖框**恢复此前的橙色：直接选中的框 `#ffd46c` 实线 2px、橙色半透明内填充 `rgba(231,183,83,.20)`；同父族随动高亮的子／孙框采用稍浅的 `#e8aa55` **实线** 1.5px、同色系较淡填充 `.14`，不再以虚线区别子孙。全局覆盖框透明度机制仍然有效，普通非选中框的原始颜色不变。
- **PBS 标签和引线**与 PDF 橙色选中框分层：PBS 父标签完全采用 Main 灰绿色与实线边框，引线 `#8cb6a3` 实线；PBS 子标签采用 Main 蓝灰色与实线边框，引线 `#8ab5da` 实线。选中标签保持各自原背景与边框颜色，仅加 Main 类似的外侧金色高亮环，不把 PBS 标签和引线整体染橙。
- 只修改 CSS 视觉样式。稳定 Block ID 父子递归选择、AG↔PDF、跨页、块组筛选、文本宽度紧包、避让算法、PDF 滚动与 SQL 均保持不变。专项真实浏览器断言读取 `getComputedStyle()`，验证原橙色框、随动橙色，以及父／子标签、引线与 Main 所用颜色逐项一致，且均无虚线边框。

- WebKit 兼容补充：`width:max-content` 标签字体经新样式表替换时，某些 iPad WebKit 路径不派发 ResizeObserver；使用**单一、只监听 `head` 样式变动和根节点 `style/class` 的 MutationObserver**，立即同步重测现有 PBS 轨道并在下一帧补测，避免公网 iPad WebKit 延迟 requestAnimationFrame 时短暂交叠，不改数据、不增加请求、不定时轮询。卸载 PDF 时清理观察器。确保字体变化不会使不同长度的相邻 PBS 再次重叠。

## 子块 PBS 漏标修复（2026-11-12）

- 先前完全相同的 bbox 会被单个矩形代表去重，但 PBS 标签也错误地只从代表块生成，令父块／兄弟块相同 bbox 的 `s1` 消失。现在只合并**视觉覆盖框**；按不同 PBS 分别生成标签，各自持有稳定 Block ID 与真实原始 bbox 锚点、独立选择状态及引线，不能因为几何重叠漏掉 `s1`。
- 精确相同 bbox 且 PBS 不同的 Block 在单页仍只画一份几何框、显示多个避让标签；跨块组**同名 PBS** 仍合并一个标签，保留全部别名 Block ID 的 AG 反向高亮。浏览器回归在第 11 页加入 `p11b0s1`、`p11b01s1` 两例完全重合几何，验收两个 `s1` 标签同时可见、标签互不重叠、点击 `s1` 只选中对应 ID，选父块递归高亮 `s1`，并测试 150% 缩放与字体变化；不需要修改 SQLite、MinerU JSON 或 PDF 本体。

2026-11-12 最终颜色裁决：以当前 Main `ui/pdf-preview.css` 的 PBS 父（灰绿）／子（蓝灰）方案为唯一对照来源。不要再使用 Lab 先前深绿／浅绿和虚线区分的方案；只读 Lab 的 PBS 标签和引线都不设置虚线，PDF Block 被选中的橙色覆盖框保持独立。
