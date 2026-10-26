# OCR2MD Lab — AG 全部跨章节四窗定位（2026-10-26）

Branch: experiment/virtual-chapters-wp0-2. 功能源码 Git 2cc45dc；隔离构建 v6-lab-cm-html-20261026-195658。

## 已完成
- 三张原生 AG（标题、媒体、LaTeX）保持业务独立，不增加混合列、第四 AG 或实体章节文件。
- 在「全部」勾选状态下点击跨章节 AG 行时，使用当前 CMD 全文索引将源码的 1-based 原始行号转换为所属虚拟章节 ID，再经过现有源码导航 ocr2md:lab-virtual-open（非旁路修改下拉值）触发 ocr2md:lab-virtual-select。
- 导航事件的 preserveAll 只针对 AG/PDF 定位，不改变用户手动切换章节时的原有逻辑；导航下拉、CM6 同一 EditorState、MD 预览和 PDF.js 页码证据均更新。全部仍勾选，AG 当前元素类型维持全书筛选。
- 在相应 MD 章节重新渲染后一帧，再发布一次原始 focusTarget，保留 origin、element ID、absolute sourceLine/sourceEnd、click intent；该复播找到已更新的同一章节时不会循环导航。PDF→导航也走同一入口，避免下拉显示与内部 scope 不一致。
- 不产生保存、章节导出、旧实体文件 GET 或其他业务写入；不改用户母文档、媒体与设置。

## Chrome + iPad WebKit 实机验收
- ag-all-cross-chapter-focus.browser.test.mjs PASS：从章节 001 的全文 AG，分别点击跨章媒体（全文第 63 行 → mineru:0:0:0）、LaTeX（第 898 行 → mineru:19:0:0）、标题（第 910 行 → mineru:21:0:0）。三种模块的导航同步、AG 全部保持勾选、绝对行号 MD 高亮均通过；原始 PDF.js 当前展示模式下，标题点击后的 OCR 区域高亮落在原 PDF 第 22 页。仅一个 CM6 窗口，原始源文本不变。
- ag-element-toolbar.browser.test.mjs PASS：手动勾选「全部」只扩大 AG 成员，不切换源码范围；当前章节媒体 5 / 全文 11，LaTeX 当前章节 25 / 全文 42。
- virtual-chapter-navigation.browser.test.mjs PASS：独立成章 6→5→6，起始编号同步，原工具栏/元素类型切换不丢。
- md-virtual-preview.browser.test.mjs PASS：真实 22 页 PDF，与 MD、AG 使用原始全文坐标进行双向定位；修订测试脚本以使用 1910 以来实际对外提供的虚拟章节导航，而非早已隐藏的 WP3 临时开关；没有放宽 PDF 与文档不变断言。原 PDF.js 在 iPad 的第 20 页请求可能显示页码 19 的已知界面差异依旧存在，本功能没有改动 PDF.js。
- ag-query.browser.test.mjs PASS：沿用 1910+ 导航入口，六章/19 标题/11 媒体/42 公式，章节 001 的 10/5/25 数量及 AG 原三实例均通过。旧隐藏测试开关移除后，核心数量及无写入断言保持原样。
- 所有上述页面测试没有物理章节 API 读取、没有对服务端业务数据发写请求，未捕获浏览器页面异常。
- 用户正式主线及原始 Lab 文档均保持不变；WP8 独立 AI 签署尚待完成。

## 接口边界
- 发起：现有 AG 各模块已经发布的 viewStore.publishFocus。
- 仲裁：WP3 CMD 查询适配模块仅根据 current getIndex() 判定 owner。
- 导航责任：source-file-navigation.js 统一处理导航下拉、URL 历史与 scope 选择。
- 保持 UI 状态：ag-module-toolbar.js 对 AG 发起导航传入 preserveAll；无任何 AG 直写 CM6/PDF 源或 URL 文件。
