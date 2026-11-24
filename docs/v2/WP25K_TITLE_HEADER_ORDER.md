# WP25K · 标题实际表头顺序
恢复点 65e4a79（1959）。用户 iPad 截图证明首列 PBS。隔离实际工作台复现：columnDefs 和 ColumnState 顺序均为 md_line/source_line/pbs，然而 PBS 仍继承 pinned:left，实际 DOM 顺序 PBS/MD Line/源码行号。原测试仅检查定义，错误通过。
修复仅在标题预设显式 pinned:null，保留块视图 PBS 左固定和其余列样式。README 最新列序不变，增加实际显示验收条件。
V2_TEST_UI_RESTORE=1：旧版本 Chromium 实际显示测试失败（PBS pinned:left）。修复后 Chromium/iPad-WebKit 均通过，实际渲染前三列 md_line/source_line/pbs，所有 pinned 状态为空；切回 frame 确认 PBS 左固定，再进标题重复验证。真实键盘、Enter、Undo/Redo、行号菜单、保存重开均通过。未改用户库、其他视图或框架。
