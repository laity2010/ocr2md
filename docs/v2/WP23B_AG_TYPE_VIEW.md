# WP23B · 同一 AG 行集的 Type 筛选预设

## 纠偏依据
用户明确要求所有 View 直接在 AG 表按 block_type 筛选，调整列序和样式。WP23 独立标题投影偏离意图，历史保留于 0c6cbbe；18f5325 revert 与 b604609 基线逐字节一致。本航点从该基线独立实施。

## 实施
- 同一逻辑块 rowData，AG 原生 EnumCheckboxFilter。
- 标题预设：block_type = title；列序 MD Block、PBS、源码行号、Type、其余列，不设 Level。
- V1 原 renderer 仅用于显示标题源码及着色；CM6 全局基础字号。不从 # 重分类 Type。
- 源码行号由现有 CM6 区间映射读取；保持页码范围、定位、原逻辑表列布局。
- 切换相同行集的预设不重新 setRows，不请求 SQL。清除原生 Type 筛选立即显示同一行集其他类型。
- 不修改 Schema、SQL 后端、PDF 或 Frame 共享源码。

## 验收
- node tests/v2-ag-views.test.mjs PASS。
- V2_TEST_AG_VIEWS=1 node tests/v2-mineru-base.browser.test.mjs Chromium / iPad-WebKit PASS：同一行对象、原生 Type 模型、精确列序、着色和字号、源码行号和点击定位、清除筛选恢复全部类型、返回原逻辑块视图、无额外 SQL 查询。
- 实机 iPad Safari 待核对。
