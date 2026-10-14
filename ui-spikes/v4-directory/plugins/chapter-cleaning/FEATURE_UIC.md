# OCR2MD v4.7.0 · 工作台导航与章节清洗插件

## Feature Contract

1. 顶栏复刻 v3 **工作目录 | 设置 | 工作台**，工作台右侧只显示一个以当前已设置书籍为 root 的下拉导航。路径可选 `书籍根目录 /`、`chapters/` 和 `chapters/*.md`；根目录进入独立 `chapter-boundary`，章节文件进入独立 `chapter-cleaning`。两个实现由 WCP 通用 `tabGroup` 共用一个可见 Tab，不让平台核心解析 OCR2MD 路径；清洗子模块及文件路径均由插件自己处理。
2. 工作台导航使用 `workspace.current` 读取文件服务保存的 root，并通过限定 `boundary.fs.fetch` CQE 取得书籍 `chapters/` 下经过核验的 MD 文件目录（不递归越权扫描）。未发布章节时根目录仍可进入定界；发布后刷新下拉即可出现新章节。只有选择书籍目录后才能导航。
3. `chapter-cleaning` 是独立插件，内部复用固化自 v3 的 `V3Workbench`、`CalibrationGrid`、`WorkingEditor`、Markdown 预览、PDF.js 与 v3 章节扫描器。标题、媒体、表格、LaTeX 子模块通过当前 cleaningModule 切换，在自己的模块约定中维护 AG 显示列；页面三窗复用 WCP TriPane、离屏驻留 ResidentHost。
4. 源码改动先存于章节草稿；撤销、重做、Obsidian 格式转换不会自动写入。**保存章节**必须明确点击并确认，经 `clean.chapter.begin/append/commit` CQE 分段上传，由 Mac 原版 `/__v3/chapters/commit` 验证 book、filename、nodeId、revision、SHA 等，保存后只采用后端返回的版本并再 stat 读回。只有当前已发布的书籍章节可以保存。媒体下载同样只有用户手动点击才走 `clean.media.download` CQE + 原版 Mac `/__v3/chapters/media/download` 安全网关。
5. 离开未保存的定界/清洗草稿须明确拒绝导航，不得静默丢弃。WCP 只维护通用 Tab 分组／切换，不依赖任何 OCR2MD 业务实现；各插件只经 CQE 联系文件服务，凭据始终保存在服务侧。

## UIC

| ID | 初始 / 动作 | 预期界面 | 数据副作用 | 自动化等级 |
|---|---|---|---|---|
| WB-01 | 设定含 PDF 书籍文件夹 | 顶部工作台激活、下拉根目录选中、章节定界 AG + 源码 + PDF | 只读 DIRjson/PDF | `workbenchV3Navigation.mjs` 双引擎 |
| WB-02 | 工作台打开下拉 | 根与 chapters/ + 已发布的全部 MD（无目录时仅根） | CQE 授权只读 list | 同上 |
| WB-03 | 选 `chapters/` 或具体章节 | 同一个工作台 Tab 保持选中，章节清洗 AG + 源码 + MD/PDF 预览 | 只读已发布章节 | 同上 |
| WB-04 | 章节清洗切换四个子模块 | 章节标题、媒体、表格、LaTeX 各使用原 v3 的扫描规则 | 不修改 MD | 同上 |
| WB-05 | 在清洗源码编辑后点撤销／重做 | 草稿局部变动、支持撤销重做 | 无 Vault 写 | `workbenchV3SaveFixture.mjs` + 人工校验 |
| WB-06 | 编辑章节后点保存并确认 | CAS + SHA 读回成功；版本冲突提示失败、不覆盖 | 专用章节保存事务 | 隔离真实 Mac Fixture `workbenchV3SaveFixture.mjs` |
| WB-07 | 媒体模块按下载图片 | 按 v3 串行下载、失败独立记录，不影响其余项目 | 用户显式授权媒体事务 | `manual-external`；真实远程媒体未做自动化下载 |
| WB-08 | 草稿未保存时切换章节或 root | 提示先保存／撤销，不能静默丢草稿 | 无写入 | 代码门禁与人工复查 |
| WB-09 | 清洗切回 root | 保留同一个工作台顶栏，进入原版定界三窗 | 无写入 | `workbenchV3Navigation.mjs` 双引擎 |
| WB-10 | 外网实体 iPad Safari 手势 | 顶栏下拉、编辑器键盘、PDF 滚动和高亮应与 v3 一致 | 无自动写入 | `manual-external`，等待用户验收 |

**限制和后续**：章节清洗 PDF.js 原文可阅读／手动翻页；单个 MD 元素与原 PDF OCR bbox 的自动对应联动仍需专门引入 v3 Sidecar 的审核链路，不得声称已完整验收。章节清洗子模块的真实远程图片下载未自动触发（避免修改用户文件）。


### UIC WB-11 · v4.7.1 全局按钮及顶栏下模块按钮区

按 `../.. /FEATURE_UIC_TOPBAR.md` 契约运行 TOP-01～TOP-08。四个子模块都只显示自身工具组，撤销／重做／保存经插件 `globalRole` 委托；清洗保存仍需确认并使用已授权 CAS。预览局部页码、PDF/MD 导航不能随模块按钮上移。
