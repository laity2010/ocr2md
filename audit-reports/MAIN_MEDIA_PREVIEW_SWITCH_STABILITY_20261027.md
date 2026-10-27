# OCR2MD V6 Main · AG 媒体预览切换闪烁修复（2026-10-27）

## 用户症状

每次在左上 AG 元素下拉切到「媒体」，预览列缩略图先消失后重新显示。直接观察 `ui/media-module.js`：`setActive(true)` 无条件 `grid.redrawRows()`，同时 `scan()` 在已有行未变的情况下调用 `grid.setGridOption('rowData',rows)`，又触发图片 cellRenderer 替换。

## 确认根因，真实浏览器独立复现

新增 `tests/media-preview-switch-stability.browser.test.mjs`，使用真实 Chrome、WebKit、本地隔离 Vite、原始 MinerU fixture 的**临时副本**与稳定 1px 有效 PNG 响应，真实切换「标题↔媒体」3 次并再次打开，`MutationObserver` 统计图片节点增删、图片 DOM 身份和实际 decoded `naturalWidth`。

| 引擎 | 修复前初次 | 修复前第 2 次 | 修复前第 3 次 | 修复后连续 4 次 |
| --- | --- | --- | --- | --- |
| Chrome | 添加 11 / 移除 0 | 累计添加 33 / 移除 11 | 累计添加 55 / 移除 22 | **累计添加 11 / 移除 0** |
| WebKit | 添加 11 / 移除 0 | 累计添加 33 / 移除 11 | 累计添加 55 / 移除 22 | **累计添加 11 / 移除 0** |

修复后第一次的 img DOM `firstId=1` 在第 2、3、4 次打开均保持 `1`，所有缩略图 decoded `naturalWidth=1`，页面无 `pageerror`、无业务 API 写入，Markdown fixture 内容不变。截图原始存 `.v6/evidence/media-switch-<engine>-first.png` / `final.png`，可视对比小图在 `audit-reports/screenshots/media-preview-no-flicker-<engine>-compare.png`（非对 DOM 身份的替代证据）。

## 最小改动

仅修改 `ui/media-module.js`：

- `setActive` 从每次 `redrawRows()` 改为保留节点、对未设置 src 的首次隐藏缩略图就地赋值（不再重建）；相同 `enabled` 状态不重复触发扫描。
- `refresh()` 比较新旧媒体行元数据（URL、偏移、采纳、媒体文件尺寸等），相同不再无条件更新全量 `rowData`。
- 媒体网络状态实际变化时只更新 `status` 和 `action` 列；**仅当实际预览地址变化时刷新预览列**。仍允许下载完成/引用替换时更新图片。
- 不改变 CMD 写入口、AG 过滤 schema、WCP focus、浏览器保存冲突或 Lab 的冻结代码。

## 回归及边界

- **Chrome + WebKit** `tests/media-preview-switch-stability.browser.test.mjs`: PASS。
- **Chrome + WebKit** `tests/media-browser.test.mjs`: PASS；13 媒体项、采用值过滤、部分下载524288、远程→本地预览、撤销/重做、重新载入验证。
- **Chrome + WebKit** `tests/media-adoption-syntax.test.mjs`: PASS，6 种引用变体与章节采用语法。
- `python3 tests/am/audit_boundaries.py`: PASS；动态运行时路由需由外部审计复核。
- 已冻结外部审计 SHA `9953137` 不会因这次新 Main 提交变化；本次作为后续增量差异检查项，不冒充 Grok/Muse 已审计。
