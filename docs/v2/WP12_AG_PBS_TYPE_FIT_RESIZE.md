# WP12 · AG PBS / Type 列宽最适与手动调整

## 反馈与根因

用户实机 iPad Safari 截图显示 V2 逻辑表 PBS / Type 空白过宽，Type 缺乏充分的缩窄空间。WP11 代码虽已有 `resizable:true`，但将 `minWidth` 直接设为拟合出的 `width`，使列宽只能向宽处拖动；Type 初始宽度还按**完整文档所有** `block_type` 值的最长项计算，而默认只显示当前 `p` 逻辑页。

## 解决方案（不改变 V1 组件）

- 继续使用与 V1 逐字节一致的 `EnumCheckboxFilter` / CSS，未改造过滤器、AG 表头 DOM、Frame、PDF 或 CM6。
- V2 仅在自己的 `ui/v2-mineru-entry.js` 中，从**当前 AG 可见行**取 PBS 与 Type 值，按 AG 单元格实际字体使用 Canvas `measureText` 测量文本；加单元格与原生过滤图标的必要空间作为初始拟合宽度。页面只含短类型时不再被其他隐藏页面最长的类型撑大。
- 把 `PBS` 的最小可拖宽度与拟合宽度分离（`minWidth:72`），`Type` 也独立设置可拖最小宽度（`minWidth:76`）。没有最大手动宽度限制，保留 AG Grid Community 原生右边缘列宽调整手势；PBS 仍左固定、不可排序，Type 仍不可排序、可用 V1 checkbox 多值过滤。
- V2 专属 Vite 适配器只对已有 Frame AG 公共测试/数据端口补充 `fitColumns` 与 `getColumnState`，使用 AG Grid 官方 `getColumnState/setColumnWidths`。用户通过 `columnResized` 手势或原生自动调整设置的宽度以**表名 + 列名**记忆于当前会话；数据焦点、`全部` checkbox 和同表刷新不会重置，切换 SQL 表返回保留手动列宽。未做跨会话永久设置，不新增状态表或本地存储。
- AG 列序依然 PBS、Type、MD Block、其他列。自动测量不碰 `logical_block` / `mineru_base` 数据和 SQL 写回，不重新排序或重建文档。

## 验收

- `tests/v2-mineru-base.browser.test.mjs`：Chromium 与 iPad-WebKit 上验证初始 PBS/Type 比整篇文档估算更紧凑、两列可拖宽再拖窄并低于默认拟合宽度、切换当前页/全部后人工列宽保持，原 V1 表头原生过滤及全部 CM6/SQL 测试继续通过。
- 根目录 `main/scripts/verify_cross_version_components.py --target lab-ocr-v2 --browser`：V1 原组件及 V2 真实 AG 原生多选过滤器必须 PASS；`tests/v2-real-markdown-preview.browser.test.mjs` 验证原 PDF 多轨标签和拖动无退化。
- 后台无新数据库操作；发布必须通过正常 Git SHA、构建和统一 release 清单检查，不触碰书籍数据或其他 Lab。
