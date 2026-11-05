# 发现分类与证据边界

## 修复前已存在（原始/早期门禁支持）

- 原始 `audit.sh` 在 AM registry visibility CHECK 处失败，未进入业务套件；这是可复现的原始 BLOCKED/FAIL，而不是业务 PASS。证据：`original/`。
- `2ee8657` 完整 gate2 才首次执行 144/144 suite，得到 112 PASS / 32 FAIL、336/448 declared cases。它暴露了 PDF join 被只读接线拒绝、rail chip 在自身 OCR bbox 内、原生结构/inventory、AG/illegal-break 等多组问题；不能笼统称全部为环境故障。
- PDF join 的旧 focus 断言要求 `mineru:6:7:parent`，而固定源码已有 `focusVisiblePDFLabel(logicalId)` 的 PBS 优先路径。这是修复前断言/实现分叉；原始浏览器套件在更早的跨页接续断言处失败，未证明原始 focus 断言本身通过或失败。修复保留原单击不得切换 checkbox 的断言，只对齐当前 PBS 身份。

## 本轮引入并修复的回归

- `988f548` 引入浏览器端 Node-only `node:zlib` / `node:crypto`，AM 静态检查发现；`e7f918f` 以共享浏览器原生 reader 修复。没有将越界 import 加白名单。

## 仍属真实功能失败，不可归入环境

- 最终门禁失败的 AG、illegal-break、PDF drag/reorder、PBS undo/restore 等，若日志为业务断言或 DOM 状态失败，保持 FAIL。局部实验没有得到完整通过，故未纳入 FIX_SHA。
- 旧 WP4/WP5 或 review 能力要求是否已过期，必须结合固定 SHA 的产品契约和真实实现逐项审查；在缺乏证据时不得标为“过期即忽略”，保持未解决/待复核。

## 环境及未覆盖范围

- 首次修复门禁 `fix-gate-1.log` 缺浏览器，为 ENV BLOCKED，不是业务测试结果。后续门禁安装并真实启动 Playwright Chromium/WebKit。
- Linux Playwright iPad-WebKit 仅是仿真；真实 macOS Safari 和真实 iPad Safari 未执行，保持平台验收 BLOCKED。
- `native-subblock-alignment` 的 Chrome 专项通过而 Linux WebKit picker 仍不可用，不能据 Chrome 推断 WebKit 通过。
- 动态/DOM/shared-store 调用点需人工审阅。静态 0 跨界和 0 未登记事件不等于运行时全面解耦。

最终各 suite 的分类以两次最终门禁的真实日志为主；本文件不把未执行的根因分析伪写为已完成。

## 第一轮最终门禁补充（最终报告以两轮为准）

- gate1 为 364/448、119/144 suites PASS、25 suites FAIL、direct API 101/309；相比 gate2 改善但不是通过。
- `pdf-block-label-setting` 和 `shared-preview-browser` 是 gate2 的 PASS 而 gate1 FAIL，暂列本轮候选的新增/可能回归，不能按“pre-existing”归类。前者真实 rail geometry 通过，但缺少预期 `p6b6s1` 标签；后者 PDF 按钮未在 Markdown 模式收起。
- `pdf-block-join-toggle` 在完整 gate1 为 PASS；`pdf-block-reorder`、drag、child-region、AG/illegal-break 等仍 FAIL。

## 两轮最终门禁复核结论

- 两轮在相同 FIX_SHA 上完全一致：364/448 declared cases、119/144 suites PASS、25 suites FAIL、direct API 101/309、static=0、unregistered events=0、runtime review=66。
- 相比 gate2 有 9 个 suite 恢复 PASS；`pdf-block-label-setting` 与 `shared-preview-browser` 在两轮均 FAIL，属于稳定复现的新失败/候选回归。前者 rail 几何通过但缺 `p6b6s1`，后者 Markdown 模式 PDF buttons 未收起。它们不是环境 BLOCKED，也不得被总改善数掩盖。
- 其他 23 个失败 suite 与 gate2 同名，但这只证明持续 FAIL，不证明每一项都已完成独立根因定位；保留 `FAIL / REVIEW_REQUIRED`。
