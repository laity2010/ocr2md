# OCR2MD WCP26 · PDF 缩放时覆盖层瞬失的审计保留项（2026-11-02）

## 原始失败

独立冻结源 `cc84b6d4d5f1a8265638293406bbabb3ac512b65` 的第 57/91 套 `tests/pdf-coverage-zoom-browser.test.mjs` 是真实 **FAIL**，4 个关联契约均不得算 PASS：用户缩放后，本应始终看到的 `.ocr-pdf-block-cover` 查询结果为 `0`，断言值为 `224`，测试原始位置 114 行。原日志：`../ocr2md-am-cc84b6d4-isolated/.v6/tests/am-full-20261102T010009Z-cc84b6d4-57-pdf-coverage-zoom-browser.test.log`。

该旧版测试记录不足以区分 PDF.js 重绘时暂时从 DOM 脱离、模块/覆盖开关被意外重置、整页重载，还是持续的页面覆盖损失。不得凭结果为 0 就推断原因，更不得修改历史审计的 FAIL。

## 定点检测（无产品变更、不削弱原门禁）

`tests/pdf-coverage-zoom-browser.test.mjs` 增加**仅在原有数量断言失败的分支**运行的诊断：读取实际覆盖开关、PDF 页面数量、是否仍保留 PDF `blockCoverageNodes` 清单、当前 AG 模块、当前 PDF 视图，并在 900 ms 后记录覆盖层数量是否恢复。最后仍严格用**即时取得的原值**与 `224` 比较并抛出原 AssertionError；不放宽缩放位置、覆盖计数、PDF/MD 模式、错误为空、原文不改等既有断言。

同样的原始测试在本次整合工作树、同一 Playwright WebKit/Chromium 和审计预加载器下连续 **3 轮 Chrome + iPad-WebKit 双引擎完全 PASS**；每轮包含四次缩放、覆盖层 224、拆分/取消拆分、跨模式独立开关、原文不改的完整路径。复验日志：`.v6/audit-reports/wp2-pdf-zoom-diagnostic/zoom-both-{2,3,4}.log`，各有两条 `PDF_COVERAGE_ZOOM_PASS`。

## 裁决

本轮 **未抓到**瞬失的细节，保留为尚未关闭的审计故障。原生产 PDF.js/覆盖层代码未改，不用更宽松的等待条件掩盖症状。正式验收必须在后续唯一的整合 SHA 下重新执行全量门禁；现有局部通过只是方向性证据，并不能恢复原冻结 SHA 里的 4 个 FAIL 契约。
