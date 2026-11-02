# OCR2MD · WCP26 PDF 覆盖框独立审计交付（统一给 Grok / Muse）

**被审源码（固定 40 位 SHA）**：`899e2958fa749658086854c0040650d9d3b99dfc`

**审计交付分支**：`audit-public-pdf-899e295`，GitHub 仓库 `https://github.com/laity2010/ocr2md`。

交付分支 HEAD 是独立交付包提交，并**不是**被审源码 SHA。该提交的第一个父提交必须是被审 SHA；`audit.sh` 会强制检查二者关系。测试用 PDF 保留在交付包的 `.v6/workspace/buffetts-alpha.original.pdf`，PDF SHA256 为 `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`；MD SHA256 为 `d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764`。不得使用审计者自己的用户工作文件替代夹具。

## 冷克隆验收

```sh
git clone --single-branch --branch audit-public-pdf-899e295 https://github.com/laity2010/ocr2md.git ocr2md-pdf-audit
cd ocr2md-pdf-audit
bash audit.sh
```

`audit.sh` 会先冻结并核对源码 SHA、PDF/MD 哈希，再建立独立源码 worktree，运行标准 AM/Git + Chrome/WebKit。若已有固定 SHA 对应的**非 PDF**遗留问题（例如用户已决定在未来 CMD 文本块模块中重建的非法断行），该标准套件可能以 FAIL 结束；**不得把它修改成 PASS，也不得让已延期项阻断 PDF 专项调查结论**。报告必须明确分别列出全量门禁、PDF 专项门禁及真实设备门禁，不把局部 PASS 伪称全量 PASS。

## 本轮唯一修复焦点

- `ui/pdf-preview.js` 中 PDF.js 页 DOM 替换、缩放、覆盖节点自动挂载；原 p页b块标签和 bbox/checkbox/子块标记的稳定性、禁用时不得自动恢复、切换视图后不混入旧节点。
- `ui/pdf-preview.css` 在 PDF.js page loading 状态下的块标签命中与普通页面交互是否互相遮挡。
- 真实浏览器测试 `tests/pdf-coverage-zoom-browser.test.mjs`、`tests/pdf-block-join-toggle.browser.test.mjs`、`tests/pdf-block-reorder.browser.test.mjs` 的原断言、加载时序和新反例。真实 CMD 接续/恢复、跨页逻辑编号、Undo、PDF 原文只读与 224 个物理 Block 覆盖必须保留。
- AM/API/消息/DOM/store 边界：不得由 PDF 控件直接修改另一模块私有状态或绕过 CMD 接口；各项结论标注测试实际覆盖还是人工代码审阅。
- **真实 iPad Safari 是独立门禁**，不能以 Mac Playwright 的 `isMobile+WebKit` 代替。若设备不可达，写 `BLOCKED: REAL_IPAD_DEVICE_UNAVAILABLE`，不要签字 PASS。

报告建议包含 `SOURCE_MERGE` 和 `PRODUCTION_CUTOVER` 两条独立裁决；保持外审 Grok、Muse 独立执行和独立证据，不修改主线或冻结快照，不降低断言。

更新说明：该源码 SHA 是 `58df7e1` 的后继提交，仅修正 WebKit 三击浏览器测试驱动的三次 `locator.tap()` 操作时序，产品 PDF/CMD 实现保持不变。独立审计者需同时检查新测试是否仍然发送真实触摸事件、是否保留原 CMD 断言，不能因工具等待误认为产品允许慢速点击接续。
