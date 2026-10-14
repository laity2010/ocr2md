# V3 工作台三窗聚焦 · WP7 人工审核 UI 修整（2026-10-08）

## 触发问题

用户实机截图显示：工作台顶部的书籍路径、文件选择、状态、MD 元素按钮、冗长安全提示，审核表上方保存/修正/文本区域，以及 PDF 上方的文件、页码、OCR 状态、元素选择、来源状态、PDF→MD 定位等多排控件，侵占主要三窗（AG 表、Markdown 源码、PDF 原文）的可视高度。不是 PDF 性能问题，是布局和控件优先级问题。

## Feature Contract（操作 / 需要 / 效果）

- FC-V3-FOCUS-01：用户进入工作台（需要已经选择目录）→ 顶部只显示紧凑书籍/目录栏；中间**AG 表 + MD 源码 + PDF 原文**三窗成为页面主工作区，高度贴合浏览器 viewport，宽桌面下去掉无谓 1280px 页面宽度限制，保留原有 AG↔源码、源码↔PDF 分割条。
- FC-V3-FOCUS-02：用户切换「文本块/关联审核」→ 审核模式标题栏保留醒目的保存按钮，其余校正和备注放到按需展开的「校正/备注」菜单；审核 AG Grid 常驻完整高度。所有人工修改仍是草稿，只有保存审核才通过原有 CAS 写入。
- FC-V3-FOCUS-03：用户更换 Markdown/定位 PDF → MD 源码标题栏包含 Markdown 文件选择器及「定位」展开菜单；原文选择后源码与 PDF 响应与 WP6 相同；状态文字单行省略但保留可访问 status 及原始完整 textContent。
- FC-V3-FOCUS-04：用户查看 PDF → PDF 标题栏只常驻页码上一页/下一页和「定位/文件」菜单；菜单按需展开时提供选择 PDF、重载、元素框选、清除、PDF→MD 锚点。PDF.js canvas 保持原有按需渲染与高亮坐标，隐藏菜单不触发任何存储写入。
- FC-V3-FOCUS-05：用户使用 834px iPad 竖屏或更窄设备 → 三窗改为上下堆叠，AG 表在上，源码中间，PDF 在下；原来的两组纵向分隔条仍可调整比例；桌面宽屏仍为左右布局且源码/PDF 上下分栏。横向溢出必须为零。

## UI Interaction Contract

- UIC-V3-FOCUS-A：进入真实 `Bufett’s Alpha` 工作台，选关联审核，预期 AG 审核表含 224 项，工作窗默认可见，面板上方不出现额外永久工具行。1600×900 类似桌面目标审计表≥470px，PDF canvas≥310px；通过 Chrome 真机只读 DOMRect 检查；数据副作用 0。验收状态：自动通过 / 待用户人工审核。
- UIC-V3-FOCUS-B：默认定位菜单均收起，点击 AG 「校正/备注」可访问备注、人工修正、撤销修正；关闭后区域高度不变化。已有真实审核暂存/写入/冲突契约 `WP7_REVIEW_BROWSER_FIXTURE_PASS` 应继续通过。验收状态：自动通过 / 待用户人工审核。
- UIC-V3-FOCUS-C：PDF / MD 两处「定位」菜单展开与关闭后，定位原元素 / PDF→MD / 元素高亮仍然可用，当前页与坐标不变。复跑 `pdfElementOverlayReal.cjs` 和 `pdfMdBidirectionalReal.cjs`。验收状态：自动通过 / 待用户人工审核。
- UIC-V3-FOCUS-D：切换宽屏 1584×930 / iPad 834×1194 / iPhone 390×844；保证无页面横向溢出、AG/源码/PDF 可见且仍可调整比例。测试 `workbenchFocusLayoutSmoke.cjs`、`macVaultHttpSmoke.cjs`。验收状态：自动通过 / 待用户人工审核。

## 技术决定 / 边界

- **不替换 AG Grid、CodeMirror 或 PDF.js Viewer**；仅调整 V3 DOM、CSS、v3 分隔条初始比例和相关测试。
- **保留所有原 data-testid 和 DOM id**，搬迁控件而不复制新实例，保证工作台现有状态/授权/版本保护复用。
- 采用 `<details>/<summary>` 原生可访问展开菜单，不引入全局弹窗框架；默认收起，只有用户主动查看时显示 OCR/MD 细节。状态仍保留在 DOM 中便于自动验收与出错诊断。
- MD:PDF 默认初始高度从 55:45 调整为约 **38:62**，使用新局部存储 key `ocr2md-v3-workbench-editor-preview-v2`；不覆盖旧版用户分隔比例或其他模块设置，拖动后的比例仍可保持。
- Vault 所有源文档均只读；真实书籍人工审核决策保持用户操作之前的原貌（不用自动化代用户审核）。

## 验收

```bash
node ui-spikes/v3-directory/tests/workbenchFocusLayoutSmoke.cjs
npm --prefix ui-spikes/v3-directory run test:ui
node ui-spikes/v3-directory/tests/pdfMdReviewFixture.cjs
node ui-spikes/v3-directory/tests/pdfElementOverlayReal.cjs
node ui-spikes/v3-directory/tests/pdfMdBidirectionalReal.cjs
```

真实体验入口：https://ocr2md.laity.bid/v3-directory/ → 工作目录 `Bufett’s Alpha` → 关联审核。

## 2026-10-08 执行验收结果

- `V3_WORKBENCH_FOCUS_LAYOUT_PASS`：真实 `Bufett’s Alpha` 加载实际 `.working.md` 后，Chrome 桌面 1584×930 三窗分别得到审核表 776px、源码 273px、PDF canvas 460px；iPad 834×1194 三窗分别 329px、231px、392px，所有菜单默认折叠且能手动打开，横向溢出 0。只读测试截图保留在 `.tmp/wp7/workbench-focus-desktop.png` 与 `.tmp/wp7/workbench-focus-ipad.png`。
- `V3_MAC_VAULT_HTTP_BROWSER_E2E_PASS`：包括 Mac Vault 的目录/授权、PDF 加载、AG/源码双向分隔条、移动端上下分隔条、文件操作与配置，回归通过。旧测试对 834px 误以为桌面分栏的断言已按新 UI Contract 更新。
- `WP7_REVIEW_BROWSER_FIXTURE_PASS`：单文件 CAS 安全保存、审核列 All 筛选、HTML `<details>` 展开后人工源码选区仍有效、人工校正、回读、冲突拒绝；在隔离临时 Vault 下通过。
- `WP5_REAL_PDF_OVERLAY_BROWSER_PASS`：第 1、4、8、11、22 页真实 canvas 叠加坐标仍正确、旋转页正常；源文件只读。
- `WP6_REAL_PDF_MD_BIDIRECTIONAL_BROWSER_PASS`：PDF→真实章节 `.working.md` 选区 `[288,453)`、MD 光标→PDF、MD 下拉→PDF、PDF 菜单→MD 的完整回归通过，WorkspaceFS 0 写请求。
- 页面已发布到现有 V3 入口；真实书籍的 PDF、OCR JSON、Markdown 与自动映射 Sidecar 无任何写入，真实人工审核尚未替用户执行。

开发端自动验收：**通过**。视觉布局人工审核：**待用户确认**。
