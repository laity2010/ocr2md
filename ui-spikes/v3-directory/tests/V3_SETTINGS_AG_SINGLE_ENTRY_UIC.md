# FC-V3-SETTINGS-V2-001 / UIC-V3-SETTINGS-V2-001

- 功能：沿用 V2 标准配置组件方式，左侧 AG 配置表负责分类、筛选、定位，右侧 CodeMirror JSON 为唯一配置源；不设置任何分散在模块工具栏的独立配置控件。
- 初始：V3 已保存配置从浏览器读取；AG 表展示全部 V3 配置键、值摘要与中文描述，V2 All/枚举筛选；右侧完整 JSON（含 H1–H6 颜色和字号、代码颜色）与表格同步。
- 操作：点选 AG 的任意行，右侧源码光标定位到对应 JSON key；在 JSON 更改数值、数组颜色、枚举等；布尔项也可直接在 AG 表勾选，更新的仍是唯一 JSON 源。保存和恢复默认按钮位于右侧 JSON 顶栏。
- 结果：有效 JSON 更新 AG 预览/草稿状态；非法 JSON 留在编辑器供修正，AG 维持最后有效的预览，保存被禁止。保存配置时完成整体校验并持久化与应用，恢复默认重置二者。
- 不变量：工作台其它位置不能再暴露 PDF 主题、硬回车等配置的重复控件；设置不会修改 PDF、DIRjson 或章节 MD；Mac Vault 授权仍属于独立的安全连接操作，不写进偏好 JSON；iPad 原生光标/输入焦点不被 AG 列表渲染抢夺。
- 自动化：`chapterPublishBrowser.cjs`、`irWorkbenchBrowser.cjs`、`macVaultHttpSmoke.cjs` 验证 V2 共享组件、AG→JSON 定位、无效配置保护、保存及恢复，Chromium/WebKit 与真实设备 iPad Safari 待用户人工验收。
- 审核：待用户审核。
