# FC-V3-UNIFIED-STYLE-001 / UIC-V3-HARD-RETURN-001

- 功能：V3 所有源码窗、AG 数据表、顶部/预览 tag 共用 V3 CSS 主题；源码使用 iOS 原生插入光标与系统选区；硬回车 ↵ 默认显示、颜色可在“设置”中选择。
- 操作：打开 V3 书籍，在“章节清洗”直接编辑源码；检查顶部/预览标签与 AG 的配色；进入设置 AG 表「值」列切换 `mdShowHardReturns`，选择 `mdHardReturnColor` 颜色，点击“保存配置”，返回源码窗。
- 需要：工作目录已加载，设置使用本浏览器 LocalStorage，V3 CodeMirror 复用 V2 WorkingEditor。
- 初始：`mdShowHardReturns = true`、`mdHardReturnColor = #839ab5`；旧 V1 配置没有颜色字段时一次性迁移默认开启，其后保留用户明确关闭的选择；全部 AG/源码/tag 通过 CSS 变量共享深色主题；CodeMirror 不叠加 `drawSelection()` 合成光标，保留 WebKit 原生蓝色光标及系统文字选择手柄。
- 预期：源码换行位置可见仅用于展示的 ↵ 小标记；仅在 AG 表操作颜色和开关，不另设独立控件；调整颜色后同时作用于目录源码、章节清洗、章节定界，不改变原始 MD 字节、位置或换行；checkbox 关闭后各窗消失，重新开启恢复；选择光标始终由系统管理。顶部/预览 tabs 与 AG 使用统一 CSS token；六级标题沿用既有统一层级样式。
- 禁止：硬回车 Widget 不成为可编辑文本，不参与拷贝与保存；不能因为刷新 AG 或展示回车而抢夺 CodeMirror iOS 光标；不能丢弃原来用户的其他配置；不能使不可编辑的 AG/目录源码变成可写；原 PDF、DIRjson 及章节文件不得被样式设置修改。
- 自动化：`tests/chapterPublishBrowser.cjs`（Chromium/WebKit）验证默认可见的 ↵、iOS native caret CSS、AG/tab 共用 CSS 变量、颜色 picker 与 checkbox 保存后生效、恢复显示、原章节编辑保存回归；V3 构建与原 H1–H6 浏览器测试。
- 人工审核：待用户在 iPad Safari 实测中文输入法、原生长按选区/拖放蓝色光标与硬回车颜色显示。
