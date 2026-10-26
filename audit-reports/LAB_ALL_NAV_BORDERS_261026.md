# OCR2MD V6 Lab: 元素 / 预览导航上边框裁切回归与修复 (2026-10-26)

## 用户反馈与基线复现
截图 `lab-261026-2306` 中，源码导航上边框已修正，但用户指出 AG 元素下拉和 MD/PDF 预览下拉边框仍看不到。问题是上次只覆盖 `.ocr-source-file-toolbar>.ocr-navigation-files`，通用 `.ts-wrapper.ocr-navigation-select` 仍保留 Tom Select 的 `min-height:36px`，大于 34px 的 AG 和预览工具栏，造成边框向上越界约 1.5px，下面也越界 0.5px。

通过 `labs/cm-html/modules/navigation-all-borders.browser.test.mjs` 用真正 Chrome 和模拟 iPad WebKit 量测三个控件：

| 控件 | 修复前 wrapper | 修复后 wrapper | toolbar | 修复后坐标 (iPad WebKit) |
| --- | ---: | ---: | ---: | --- |
| 源码文件 | 30px | 30px | 34px | y=41.5..71.5，bar=40..74 |
| AG 元素 | **36px** | **27px** | 34px | y=43..70，bar=40..74 |
| 预览类型 | **36px** | **27px** | 34px | y=407..434，bar=404..438 |

Chrome 基线相同，原 AG / MD 下拉 `clipTop=true, clipBottom=true`。新版均为 false。

## 方案
- 提交 `501b24e`：将通用 Tom Select wrapper 的高度/min/max/box-sizing 改为 27/0/27/`border-box` 并垂直居中。通用 control 按 27px border-box，padding 缩为 1px，`line-height:1.15`。源码文件导航仍有专属 30px 覆盖，不回退已有布局。
- 不创建新字号键，继续复用 `globalUi.navigation.dropdownFontSize` 的 CSS 变量；8–16pt。Playwright 在最大 16pt 验证三个下拉均仍位于工具栏内部且使用 21.33px 字体，打开 AG 元素和预览菜单均正常。
- 只改隔离 Lab 的 `labs/cm-html/modules/navigation-select.css`，不改业务文件的选择逻辑，未修改 CMD / Save / PDF.js / AG 表数据模型，也未合入主线。

## 实测与截图
- Lab 版本 `v6-lab-cm-html-20261026-232911`，通过本机及用户截图所用局域网 `https://192.168.1.10:4443/labs/cm-html/` 发布；公网 Lab 也检查通过。
- **Chrome + iPad WebKit** 本地及公网 Chrome 实际测量 PASS，局域网 iPad WebKit PASS，三个控件上下边框均在 34px 工具栏内；字号16pt不越界，两个菜单真实点击可展开。`navigation-font-and-border.browser.test.mjs` Chrome PASS：设置页滑条10→12pt，导航框和菜单即时刷新，未保存设置未发业务 API 写入。
- 截图（真实浏览器，非画图）：`audit-reports/screenshots/nav-all-iPad-WebKit-baseline.png` 旧版，`nav-all-iPad-WebKit-before.png` 2329版，以及 Chrome 对应截图；对比裁剪 `nav-iPad-WebKit-element-comparison.png` / `nav-iPad-WebKit-preview-comparison.png` 和 Chrome 对应版本。
- Lab 母 Markdown SHA-256 `a25b17c13909b388c619e61826fe041c2b67c7e575215cea39b77a1ed2124087` 未变；正式根仍 `v6-20261026-102651`，正式 Git 主线 `2c21c54` 未变。iPad WebKit 是移动引擎自动测试，仍需用户真实 Safari 确认体验。
