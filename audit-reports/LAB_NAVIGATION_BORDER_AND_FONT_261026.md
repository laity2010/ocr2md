# OCR2MD V6 Lab · 修复导航下拉边框裁切与全局字号设置（2026-10-26）

## 用户实机截图故障
- Safari 截图 `lab-261026-2239` 中源码顶栏的章节文件下拉框上边框不可见。
- 真实 Playwright Chrome、iPad WebKit 基线计算均为：源码顶栏 y=40..74，高34px；Tom Select 外层 y=38.5..74.5，高36px，而内部 control 30px。**根因：外层 `min-height:36px` 覆盖只修改了 `height:30px` 的样式**，产生上溢并被裁切。

## 修复与设置注册
- 功能提交 `adf79f1`。只改实验分支中的独立 `navigation-select.css/.js` 和 `settings-module.js` 适配器，不修改正式主线业务代码。
- 文件导航 wrapper 显式 `min-height:0; max-height:30px; height:30px; box-sizing:border-box`，内部 control 30px border-box，并减小垂直 padding。34px 顶栏不加高，右边 >− / >+ 仍可见。
- 设置注册键 `globalUi.navigation.dropdownFontSize`；注册模块 `N`，中文分类 `全局 UI / 导航下拉`，滑条值范围 8–16pt、默认10pt、步长1pt；Settings 仍是 CMD JSON 唯一编辑/保存，模块通过 `settings.changed` 更新 CSS 变量 `--ocr-navigation-font-size`。文件、AG 元素、预览三类 Tom Select 控件与展开选项共用字号。
- 已有的旧 Lab settings.json 不会被强行改写：打开设置会把新键添加到设置源码的 CM6 可撤销文档，用户使用既有保存按钮才持久化；此次测试未触发任何业务 API 写入。

## 截图与验收
- 构建 `v6-lab-cm-html-20261026-230644`，基于 `adf79f1`。Mac 当时系统负载非常高（Steam/Factorio/虚拟机并行），两次常规构建未在超时前完成；第三次以 `vite build --minify false` 生成**功能相同、未经压缩的 Lab 构建**，成功部署到 `https://ocr2md.laity.bid/labs/cm-html/`，正式根仍 `v6-20261026-102651`。
- Chrome 与 iPad WebKit 专项 `navigation-font-and-border.browser.test.mjs` 实测：**wrapper/control y=41.5..71.5、高30px，完整包含在 toolbar y=40..74**，上、下边框均完整；初始字体 10pt(13.33px)，到设置中通过滑条改为12pt时文件导航与菜单立即改为16px；返回工作台后仍应用。无 pageerror 和业务写入。
- iPad WebKit `file-navigation-visibility.browser.test.mjs` 回归 PASS：1024宽场景导航宽420px，菜单宽540px，展开菜单 x=476..1016，全部在1024px视口内；实际选章与右侧缩进按钮无冲突。
- 截图：`audit-reports/screenshots/nav-border-iPad-WebKit-after.png`、`nav-border-iPad-WebKit-crop.png` 和对应 Chrome 截图，均从真实浏览器渲染后获取，非示意图。
- Lab 母文档 SHA256 `a25b17c13909b388c619e61826fe041c2b67c7e575215cea39b77a1ed2124087` 在本次发布前后未变化；未触碰正式主线和保存冲突门禁。移动 WebKit 是自动化模拟，不等于用户实体 Safari 人工验收。

## 边界
- 只有 Lab 已发布；Grok/Muse WP8 独立审计和主线合并尚未执行。较窄窗格里的控件仍可能合理显示省略号，但悬浮菜单始终完整位于屏幕内、文件名自然换行。
