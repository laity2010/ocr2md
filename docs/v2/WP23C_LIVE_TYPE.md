# WP23C · 共同 AG Type 随 CM6 正文实时更新
基线 cff15e8。用户实机指出原标题改成文本仍留在标题 View，源码空行无法新增标题。

## 失败证据
原版本真实 Chromium 回归：删除逻辑 ID 1 的标题前缀后仍返回 [1,23]，预期 [23]。代码的 overlayCMStructure 只更新 md_block/位置而不更新 AG 有效 Type。

## 修复边界
- 复用 V1 titleSourceParts 判定 ATX 标题，统一派生共同 AG 行 Type；不创建标题专属数据集。
- 保留持久化来源类型，标题标记加入/去除时有效 Type 即时变化；其他非标题类型在未识别为标题时保持来源类型。
- 原生 AG Type 筛选不变，原两表及 SQL 保存 API 不变。
- 真实空逻辑块有 logical_id，可以直接写入；虚拟组间空行无对应记录，WP18 保护仍然有效。
- 虚拟空行创建新块需要独立设计、验收：新 logical_id、PBS/顺序、无原始 PDF 几何、原子 SQL 新增及 Undo/Redo。当前 structure-commit/flushStructure 明确拒绝未知 ID 和增减数量。不得伪装为前块正文或解除分隔符保护。

## 验收
- node tests/v2-live-block-type.test.mjs PASS。
- node tests/v2-ag-views.test.mjs PASS。
- V2_TEST_AG_VIEWS=1 node tests/v2-mineru-base.browser.test.mjs Chromium / iPad-WebKit PASS：删除原标题、最后一个标题消失、恢复普通文本为标题、连续 Undo、真实空块写入标题；同一 AG 行集和原生过滤模型不变。
- iPad 实机和虚拟空行新增逻辑块待验收/实现。
