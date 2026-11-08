# 校译 Lab · 独立模块最小公开契约

校译模块与分句模块平级：共用 V6 Dockview、CM6、Everforest/Sarasa **显示技术**，不调用分句引擎、不读取 Gold、不修改 CMD 或分句侧车。

1. **TR01** `load_dataset(inputDirectory)`：从 `translation-review/input/` 独立读取 CMD、统一句块表与多 AI 译文；检查原始 SHA、记录 ID、字段和顺序完全一致；仅以只读响应供校译页使用。直接测试：`python3 -m unittest tests/test_v6_translation_review.py`。
2. **TR02** `prepareTranslationReview(dataset)` / `filterTranslationRows(rows,mode)`：基于每条的 `original/corrected/translation` 构成只读比较表与差异筛选。直接测试：`node --test tests/translation-review-core.test.mjs`。
3. **TR03** `createTranslationCompareWorkspace(container,model,{onSelect})`：独立 CM6/Dockview 多窗，左窗完整 CMD、右窗按 AI 数量纵向堆叠；窗口仅通过不可变 `id` 和源文 `from` 锚点同步。真实浏览器测试：`node tests/translation-review-lab.browser.test.mjs`（Chromium + iPad WebKit）。

## 路由

- `/labs/<lab-id>/`：Lab 首页，仅运行环境入口；Main `/` 仍是 V6 工作台。
- `lab-home.html`：独立首页。
- `sentence-benchmark.html`：已有分句 Lab，不改变业务操作。
- `translation-review.html`：校译 Lab，不包含任何分句按钮、分句仲裁或 Gold 业务代码。

## 输入输出

- 独立输入：`labs/sentence-benchmark/.runtime/translation-review/input/`，文件 `document.md`、`translation-units.json`、`translated-<ai>.json`。首次数据通过一次性**复制**移入该独立输入目录；页面不动态读取分句 Lab 的 exports 文件。
- 独立输出：`labs/sentence-benchmark/.runtime/translation-review/output/`。当前只读比较阶段尚无写入 API；后续英文／译文仲裁要增加自己的审阅契约、CAS 保存和直接测试，不能复用句界 sidecar。
- 校译输入由独立 `/api/translation-review-data` GET 返回；不是 Main 的 CMD `/api/document`，也不是分句 `/api/sentence-review`。

## 诚实边界

当前可展示、筛选、联动多 AI 的两层纠错和译文，但**尚未实现人工采用、落盘、校译结果导出或 Obsidian 双语重组**。未被真实测试覆盖的主线发布、外部审计、Linux 兼容不作通过声明。
