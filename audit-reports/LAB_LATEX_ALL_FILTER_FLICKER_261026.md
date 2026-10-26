# OCR2MD · Lab LaTeX 审阅的整表短暂消失（2026-10-26）

## 用户反馈与复现
- 用户多次报告 2046、2057 版没有改善，并提供 iPad Safari 截图：`全部` 勾选、`LaTeX 42 项`，但只见源代码行 234 一项，下面是大块空白。原先验收只检测行元素不被重建，未检查行模型的 *筛选结果* 是否短暂缩减，是遗漏。
- 本次专设 `labs/cm-html/wp0-2/latex-review-filter-timeline.browser.test.mjs`，完整模拟 `章节文件/001` → `全部` → `LaTeX` → 审阅值 `待复核` 改 `latex`，记录源文更新即时、20/100/300/650/950/1400/2200ms 和每次 AG `modelUpdated`。
- **2057 版故障复现**：Chrome 42→1→42（100ms 时仍 1 行）；iPad WebKit 42→1→42（300ms 时仍 1 行），与截图吻合。`api.getFilterModel()==={}`（没有启用 AG 列筛选），但 `api.isAnyFilterPresent()===true`（因为 WCP 一直给「全部」挂着一个 `from` 偏移量集合构成的外部过滤）。
- 根因：CMD 修改审阅时向唯一 Markdown 插入/更新注释，后续公式 `from` 偏移量发生变化；LaTeX 的 `refresh()` 误判有过滤器并立即 `grid.onFilterChanged()`，使用 WP3 尚未 700ms 重建的旧 `from` 集合排除了后续 41 行。WP3 后续新建 CMD 索引再重新过滤，行才恢复。之前仅修复下拉框和 KaTeX preview 组件 DOM，无法修复行模型的瞬间过滤归零。

## 有界修复
- `labs/cm-html/wp0-2/ag-query.js`：`scopedKeys()` 在 `全部` 时返回 `null`，即明确**不设置外部章节过滤**（不再用全集偏移量 Set 冒充无过滤）。只对「当前章节」创建真正的章节过滤。
- `ui/latex-module.js`：仅当 `grid.getFilterModel()` 中有实际列值过滤时才手动刷新 AG 筛选；不使用把外部章节过滤也算作过滤的 `grid.isAnyFilterPresent()`。WP3 仍负责自己的延迟 CMD 索引更新，不改业务路由、CMD 唯一写入口或物理文件。

## 结果与边界
- 提交 `a78a262`；实验构建 `v6-lab-cm-html-20261026-211854`，通过 `https://ocr2md.laity.bid/labs/cm-html/` 发布。
- 本地 Chrome + 移动端 iPad WebKit：「全部」42 项，从同步到 2200ms 以及每次模型刷新**始终 42 项**；「仅当前章节」25 项始终 25 项。
- 公网 Cloudflare Chrome + iPad WebKit：「全部」42 项全时间节点不掉行，PASS。
- 既有 `latex-review-refresh.browser.test.mjs` Chrome/iPad WebKit 本地 PASS：下方预览控件零重建，Undo 恢复文档；`ag-all-cross-chapter-focus.browser.test.mjs` Chrome/iPad WebKit 本地 PASS：媒体/LaTeX/标题跨章节定位。
- 自动化 WebKit 采用模拟移动 iPad 参数的浏览器引擎，不等同用户手中的真实 Safari 人工验收。
- Lab 母文档哈希保持 `33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc`；正式主线公网版本 `v6-20261026-102651` 保持。仅限独立 Lab 未合并、未推送主线、未完成 Grok/Muse WP8 审计。
