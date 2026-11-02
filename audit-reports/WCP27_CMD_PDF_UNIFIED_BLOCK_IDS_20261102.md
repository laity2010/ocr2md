# OCR2MD WCP27 · CMD/PDF 统一块 ID（2026-11-02）

## 人机验收发现

PDF 覆盖框能显示 `p页b块` 和 `p页b块s子块`，但源码 CM6 中只有 `<!-- minerujson:block:v1:页:块 -->` 等原始注释，用户无法直接看到与 PDF 同一格式的 ID。

## 修正

- 将原 `pdf-source-locations.js` 的**唯一作用域解析器**迁入 `ui/cmd-block-labels.js`，作为 CMD 的父子块源数据投影；PDF 兼容接口仅作 `parent/child` 过滤，不另行推断身份和作用域。
- CMD 同时投影原始块 ID、逻辑父块 ID、子块 ID、实际标签行、作用域有无正文以及可供多窗使用的 `mineru:页:块:路径` 定位 ID。标签作用域仍为本行至下一标签前，绝不占用下一子块正文；逻辑编号与 PDF 现有 CMD Join/Move 相同。
- CM6 通过独立 `GutterMarker` 显示可点击 `p4b2`、`p4b2s1` 标签，源码不被添加任何显示文本，Undo/导出不变。含正文为实线、仅有标签无正文为虚线；未标定的子块不能在源码虚构标签，PDF 保留 `unmarked` 虚线提示。
- 源码点击发送已有 `publishFocus` 公共消息，触发 PDF 与 AG 的原有跨窗定位，不直接接触 PDF/AG 私有状态。
- AM 的注册接口、源码归属、跨模块 import 约束同步更新；此前的测试/断言未删减或放宽。

## 验证

- `tests/cmd-source-block-labels.test.mjs`: 224 原始父块，显式标定后 43 子块，`p4b0s0` 空块虚线判定，`p2b8` 合并后页内逻辑编号一致。PASS。
- `tests/cmd-source-block-gutter.browser.test.mjs`: Chrome / iPad-WebKit 均 PASS；源码视图显示标签、无正文虚线与 PDF 相同、点击精确定位、原文只读、通过实际 CMD 接续后 PDF/CM6 标签同步更新。
- 原始 `tests/pdf-child-region-select.browser.test.mjs`、`tests/pdf-coverage-zoom-browser.test.mjs`、`tests/pdf-block-reorder.browser.test.mjs`: Chrome / iPad-WebKit 均 PASS；不回退先前 PDF 页 DOM 恢复、子块、拖动、Undo 功能。
- `python3 tests/am/am.py build/check`: PASS；AM Python 43 tests PASS（1 skipped）。浏览器结果是模拟移动 WebKit，不是 iPad 实机。

## 回退/人机验收

本次 Main 发布前 Git tag `human-acceptance/pre-cmd-labels-20261102` 指向 `899e2958fa749658086854c0040650d9d3b99dfc`。若人机验收失败，保留出错提交与运行记录，使用隔离 worktree 重建旧 SHA 发布回退，不使用 `reset --hard`、`force push`，也不覆盖用户数据。
