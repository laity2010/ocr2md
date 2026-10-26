# OCR2MD V6 Lab · 源码导航下拉放大与完整可视（2026-10-26）

## 基线截图复现
在隔离 Lab（同一 CM6 源码视图）使用 Playwright Chrome 1440 宽、iPad WebKit 1024 宽和较窄 820 宽三组视口，实际选中章节 `001`，单击源码顶栏的 Tom Select 导航，截图记录控制框、悬浮菜单和缩进按钮的位置。原布局的导航宽度被限制为 410px（1440 下源码窗 720px，产生明显闲置空间）；820 宽时导航仅 318px，弹出菜单同样只有 318px，长章节文件名大量换行。

## 修复（仅 Lab）
- `538a3ff`：移除源码文件导航固定 410px 上限，导航填满扣除 `>−`、`>+` 控件后的剩余宽度；提高控件高度由 27 到 30px，并增加字体到 13px，不增加顶栏高度。
- `a74eb56`：Tom Select 把 `positionDropdown()` 用于菜单打开、搜索、滚动和窗口尺寸变化。仅在文件导航适配器上沿用其定位结果，再将弹层期望宽度扩至至少 540px（若视口允许）并限制在视口左右各 8px 以内。保留原生业务 `select` 作为唯一入口，其他 AG/预览下拉不变。过长标题在下拉选项内自然换行，选中项的完整路径保留为 tooltip。

## 浏览器/截图验收
| 场景 | 旧文件导航宽度 | 新文件导航宽度 | 旧弹层宽度 | 新弹层宽度 | 弹层左右边界 |
| --- | ---: | ---: | ---: | ---: | --- |
| Chrome 1440 | 410px | 628px | 410px | 628px | 727–1355px |
| iPad WebKit 1024 | 410px | 420px（公网 413px，字体度量差异） | 410px | 540px | 476–1016px |
| iPad WebKit 820 | 318px | 318px（空间上限） | 318px | 540px | 272–812px |

- `labs/cm-html/modules/file-navigation-visibility.browser.test.mjs`：3 组本地全部通过；真实点击章文件选项，原生导航同步更新，按钮仍全部可见，菜单左右、上下均位于视口以内。公网 iPad WebKit 1024 也通过真实点击和几何校验（屏幕截图已在本地完成；公网截图因 Cloudflare 字体等待超时，公网测量使用不截图模式）。
- `labs/cm-html/wp0-2/virtual-chapter-navigation.browser.test.mjs`：Chrome/iPad WebKit 本地通过，章节合并、文件名更新、设置切换、元素模块保持状态，无文件写入。
- 截图证据：`audit-reports/screenshots/file-nav-Chrome-1440-compare.png`、`file-nav-iPad-1024-compare.png`、`file-nav-iPad-820-compare.png`，以真实前后浏览器截图拼成，另保存 iPad1024 的完整菜单原图。
- 已部署 Lab `v6-lab-cm-html-20261026-223935`。实验母 Markdown SHA-256 为 `33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc`，未变化；正式根仍 `v6-20261026-102651`，未合并。

界限：选中控件宽度始终受源码窗物理宽度及缩进按钮约束；极窄窗下文件名可以在控件内省略，但打开的文件菜单会完整显示、文字可换行。WebKit 自动化模拟 iPad 浏览器，不宣称实体 Safari 人工验收。
