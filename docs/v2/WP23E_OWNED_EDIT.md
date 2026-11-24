# WP23E · CM6 真实多行编辑（隔离验收）
基线 79804e2。仅在隔离工作区验证，不改变用户数据库、线上资源及默认旧库协议。

## 实现边界
- 复用唯一实际 V2 CM6 EditorView、StateField/StateEffect 和原生历史。v3 的普通编辑用 planRealTextEdit 从原始真实区间推导每块新正文，验证与 CM6 请求相等，再在同一事务仅追加必需的真实尾 LF；不删除人工多余 LF，不自动拆块，不通过 mapPos 猜测正文归属。跨两个块的删除仍拒绝。
- v3 的 Markdown 预览直接渲染实时 CM6 文档，不再人为插入预览 LF；行号沿用源坐标。行删除、PDF 原文插入/替换使用已有源码接口；本轮仅测试 PDF 插入命令传入样本文字，不宣称实测原 PDF 文字层或实机。
- SQLite 文件头 user_version=2303 作为显式协议标记（无新表/列）；未标记的书籍仍按旧 v2 读取。仅测试夹具初始化标记，没有生产迁移接口、自动迁移或用户数据写入。
- 既有 md-commit 接收 commit-v2-owned-md + 全部 PBS 结构快照；BEGIN IMMEDIATE 中检查协议、结构旧值和每个文本旧值、保存后验证 v3 全文合法性，不满足则整批回滚。旧客户端的 md-commit、structure-commit、logical-rebuild 拒绝修改已标记库。v3 单行整理、表格恢复和旧归组命令禁用/拒绝，待相应兼容航点。
- 标题内部识别与精准标题定位属 WP23H，本步不宣称标题 View 已完成多行支持。结构归组属 WP23F，仍禁止 v3 旧结构写入。

## 真实验收
- python3 tests/test_v2_owned_edit.py -v：2 tests PASS。标记/未标记协议分离、结构旧值冲突、文本旧值冲突、非法尾 LF 整批回滚、旧接口拒绝、保存后重开。
- node tests/v2-owned-edit.browser.test.mjs：真实 V2 Vite 工作台、CM6、AG，隔离临时 SQLite 由真实 Python dispatch 读写，F02 授权/探测用测试桩，不连接线上网关。Chromium、iPad-WebKit 各 PASS：267 块，真实键盘输入标题、Enter、多行粘贴事务、删除、真实末尾 LF、Undo/Redo、8 次 SQLite 增量提交、重新加载；其余所有块正文与身份严格一致，区间无间隙无重叠，无 groupEndPad。无实际 iPad Safari 设备验收。
- 旧版 MD、结构、Markdown 往返、WP18 前缀和 AG 预设定向回归 PASS。
- 既有用户库与线上仍是旧模式；后续需独立验收迁移入口和 WP23F 原子归组，不能把测试标记设置冒充生产迁移。
