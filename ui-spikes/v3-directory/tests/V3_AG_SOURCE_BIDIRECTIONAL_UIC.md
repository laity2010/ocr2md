# FC-V3-AG-SOURCE-LINK-001 / UIC-V3-AG-SOURCE-LINK-001

**统一能力：** 所有 `AgSourcePair` 实例提供可选双向 AG ↔ CodeMirror 定位、高亮协议：`bindSelection`、`selectFromGrid`、`setLinkEnabled`。模块未启用时不需要显示联动，但不得缺失能力或另外发明私有实现。

**首个完整接入场景：设置。** AG 行点击→源码对应 JSON 顶层键滚入视野、选中并持久高亮该键所在源码行，AG 对应行也高亮；点击/移动源码光标→反向识别光标所属顶层 JSON 配置项（包括嵌套对象、数组与跨行值），AG 自动滚动且高亮该行。源码变更时保持配置草稿、解析/错误保护不变；AG boolean checkbox 更新值后不抢 iOS 焦点，但要继续高亮两侧。统一装饰在深色主题、失焦时仍可见；不以 `contenteditable` 的 DOM 文本位置反推原始文档偏移，使用 CodeMirror 的真实 selection 和 JSON 字符串结构索引。

**初始状态：** 没有联动项；切换设置，AG Grid 与 JSON 编辑器正常显示。选中状态仅与本页内存同步，不写入偏好 JSON、DIRjson 或 Mac Vault。

**交互：** AG→源码，源码→AG，滚动到跨行 `agSourceScenes` 对象内的深层属性，切换到布尔项，输入未完成 JSON，修正错误后再选择。每次 AG 和 CodeMirror 高亮同一顶层设置项；源码输入焦点不被 AG 的反向滚动夺走，AG 点击可进入源码；用户点击其他键时高亮即时更新。受筛选影响而隐藏的行在源码主动定位时才解除过滤以显现。

**回归：** `tests/settingsLinkBrowser.cjs` Chromium/WebKit 真实浏览器运行 AG ↔ JSON 键交互、跨行属性、失焦持久高亮及 boolean checkbox；`chapterPublishBrowser.cjs` 检查未修改章节定界/清洗，`irWorkbenchBrowser.cjs` 检查 PDF/MD 关联。真机 iPad Safari 点击、选中、高亮及滚动待用户审核。

**数据副作用与不变量：** 联动本身零持久化写入、零业务修改。按钮、目录导航、双窗布局、AG 过滤及源码可编辑权限沿用既定场景配置；跳转不会丢草稿，不会造成双方互相触发无限循环。


**统一组件迁移（2026-10-11）：** 设置专用的双向选择和 JSON 键范围解析已经由网络设施 `laity-settings-panel`+`laity-source-surface` 接管。原本 `settingsLinkBrowser.cjs` 的测试已经改为直接调用共享公开接口；其他业务仍可继续使用本地的 `AgSourcePair` 合同，无权创建新的独立设置面板。
