# WP23 · 标题派生 View

基线：b604609（WP22 PDF 恢复点 6275730）。

## 范围与契约

- 现有 AG 工具栏下拉增加标题选项，工作区未授权时保持禁用。
- 只从 CM6 的 getBlocks/getIntervals/getLineAtOffset 获取实时逻辑正文和位置。
- 复用 V1 title-view.js 及 md-ag-projection.js 原件（逐字节比对测试）。
- MD Block、Level、Type 为前三列；Level 是 Markdown 层级符号，Type 是实时标题语义。保留其他只读身份及 OCR 类型。
- 完整标题源码使用与现有 CM6 H1–H6 一致的 Everforest 颜色，字号使用全局基础字号，不按层级放大。
- 不新增 SQL 查询接口、物理表、SQL View、持久化字段、编辑器、AG 实例、PDF 实例或公共 Frame 组件。
- AG 原生 EnumCheckboxFilter；切换标题视图时暂存物理视图过滤模型，返回对应物理视图时恢复。
- 通过现有逻辑身份消息实现 AG/CM6/MD/PDF 定位，不新增焦点状态。
- 识别遵循 V1 ATX 标题源码规则；当前一逻辑块一正文行，全文标题列表不受逻辑块页码范围影响。

## 已取得的验收证据

- node tests/v2-title-view.test.mjs：PASS；H1–H6、错误/无标题标记、原 OCR 类型不决定实时标题、稳定身份、列序、原版过滤器及 V1 文件字节一致。
- V2_TEST_TITLE=1 node tests/v2-mineru-base.browser.test.mjs：Chromium / iPad-WebKit PASS；真实 AG/CM6 夹具验证跨页标题、MD Block 字号变化及 H1/H2 色值、点击定位、原生 Type 复选过滤、CM6 增删标题与 Undo、返回逻辑块审阅列序，且标题切换不发额外 SQL 查询。
- iPad Safari 实机未验收。未修改用户书籍数据。
