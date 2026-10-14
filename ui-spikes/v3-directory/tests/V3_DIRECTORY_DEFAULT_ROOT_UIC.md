# OCR2MD V3 · 工作目录默认 Root UIC

- 状态：自动化通过后 **待用户审核**；真实 iPad Safari 为 `manual-external`。
- 基础映射：Mac iCloud Obsidian 实际 Vault 根目录 `Obsidian/ocr2md`，统一 V3 文件服务 WorkspaceID 为 `obsidian-ocr2md`，逻辑 `/` 不能物理迁移或修改；书籍工作目录为其 `/ocr2md` 子目录，即 `Obsidian/ocr2md/ocr2md`。
- 初始状态 / 首屏：打开 `/v3-directory/` 即在 `工作目录` 标签，目录路径应显示 `Obsidian/ocr2md/ocr2md`（即使尚需输入 Mac Vault 密钥，也不先闪现 Vault 的 `/`）；取得授权后直接 `list('/ocr2md')`，以目录表列出书籍，不先请求 `list('/')`。保持设置组件在空闲时异步加载、设置 Tab 在未就绪前禁用。
- 动作：双击 AG 的书籍/子目录名进入 `/ocr2md/<folder>`；点击置顶“返回上级目录”返回到默认根目录 `/ocr2md`；默认根目录时返回按钮不可用，不能进入包含 `tools`、`.obsidian` 等项目目录的 Vault 上层。
- 效果：目录浏览读写依然使用底层原有逻辑 `/ocr2md/...`，PDF、DIRjson、章节文件物理路径不变。不修改授权密钥、服务端物理根目录、iCloud 文件或存储合同。默认根目录不自动设置某本书为工作台目标，用户仍须按现有“设为工作目录”交互选择书籍。
- 不变量：底层 `V3DirectoryController` 默认构造行为仍为 `/`，只有调用方显式传入初始目录 `/ocr2md` 才改变其默认初始状态。其他工作空间/测试夹具不受影响。
- 自动验收：`npm run test:directory:home`（Chromium、WebKit）；直接使用真实 Mac Vault 的 read-only HTTP API，禁用测试夹具 Service Worker，断言初始化请求、首屏路径、Book 列表、上级导航下限、目录进出；零真实文件写入。底层 `src/v3DirectoryController.test.ts` 使用 esbuild 独立测试默认与显式初始目录（54 个场景）。章节发布/标题清洗/PDF/注释回归沿用默认首页，不再从 Vault `/` 多走一级。
