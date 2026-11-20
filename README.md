# OCR2MD · V2 · Lab-Frame 空框架基线

本项目是**从已验收 Lab-Frame** `bf03bfd13db9be9951776f7e4a393f9052221676` 创建的全新、隔离框架型 V2，取代已失败的 MinerU/SQL/三窗业务 V2。每次实施先读共用 `AGENTS.md`，再读本 README；禁止根据旧 V2 的 README 或构建产物恢复业务代码。

## 唯一源码、发布与数据权威

- Git 工作树 `labs/lab-ocr-v2`，分支 `experiment/lab-ocr-v2`，唯一发布 URL `https://ocr2md.laity.bid/labs/lab-ocr-v2/`。
- UI 源码完全继承当前 Lab-Frame 的 `ui/frame/` 和依赖组件，采用其已验收的四窗空壳与全局设置：**启动直接进入 `settings.json`，AG 模块下拉禁用，源码导航没有返回按钮。**
- 资料目录仅在原 Settings `workspace.dataDirectory` 中绑定；采用目录立即通过**已验收 F02 公开 API** 创建、写入、读回、删除临时探针文件，状态栏公布实际成功或失败，未保存设置不得假称已保存。目录树不自动展开；用户可手动展开和收起。
- 独立本地设置命名空间：`ocr2md.lab-ocr-v2-frame.settings.json.v1`，**不继承**旧 V2（包括 `lab-ocr-v2-fresh`）或 Lab-Frame 的浏览器资料目录；只有全局保存后才持久化。
- 公开工作区文件接口 **复用** `ui/frame/workspace-io.js` 的 F02 API，服务器直接使用现有 `/labs/lab-frame/api/workspace-io/{probe,list,read,create,replace}`。这是已验收、正式公开的公共端口；V2 **不建立平行文件 API**、Main 编辑 Cookie、权限检查、网关进程、隧道或独立 TCP 端口。F02 的授权唯一来源仍为 Main `/api/workspace/roots`。
- 当前 **没有 V2 SQLite、MinerU 转换、OCR、Markdown 正文、AG 业务表、CM6 业务编辑或 PDF 内容。** 四窗仅是 Lab-Frame 的原空布局。用户现有 PDF/JSON/SQLite 完全不属于本项目运行数据，均不删除、不导入、不覆盖；旧 V2 `api/v2/` 已废止且必须 HTTP 404。

## 构建和发布约定

- `labs/lab-ocr-v2/vite.config.mjs` 是从 Frame 标准 Vite 构建配置派生的极薄**构建时**适配：仅 V2 名称、URL、版本、独立 Settings 存储前缀、自动更新身份。禁止改写 `ui/frame/*.js`、`ui/frame/*.css`、`ui/frame/index.html` 和 Frame 共用依赖，相关源码应当与 Lab-Frame 验收 SHA **逐字节相同**。
- `scripts/v2_frame_publish.py` 复用 `scripts/v6_frame_publish.py` 的统一发布器与真实网关运行时门禁，只更新统一 `lab-ocr-v2` 发布槽和首页的 V2 卡片；发布时验证其他六个 Lab 的清单及源文件哈希不变。不能发布旧的双表三窗描述。
- 旧 V2 业务历史只保留在 Git 证据标签 `archive/retired-lab-ocr-v2-20261120`（旧提交 `0470d9f`），不再作为工作区、构建输入或运行 API。旧工作树已被**删除后重新从 Frame SHA 建立**，而不是在旧 V2 上修补。

## 验收门禁

1. 当前 V2 HEAD 以 `bf03bfd13db9be9951776f7e4a393f9052221676` 为祖先，Frame UI/设置/目录树源码逐字节一致；V2 不包含旧 `scripts/v2_book.py`、`scripts/v2_http.py`、`ui/v2/`、`vite.v2-three-windows.config.mjs` 等文件。
2. Chromium 和 iPad-WebKit：真实 V2 构建直接打开设置、AG 下拉禁用、无返回按钮；目录树仅手动展开，同一路径重新采用仍触发 F02 临时文件验证，状态栏展示正在检测、结果与未保存区分，刷新/更新正常。
3. F02 安全：真实共享网关继承 V1 的 macOS iCloud 访问授权、LAN Origin（含 `:4443`）及 Main Cookie；无授权写入 HTTP 403；旧 V2 `api/v2/` 必须 404。不要以模拟请求通过冒充实际 iPad 会话已完成工作区绑定。
4. 统一发布：7 个 Lab 的资源与 manifest SHA256 核验，除 V2 的发布内容与首页 V2 卡片外其他六个 Lab 不变；原 V2 URL HTTP 200，产物包含精确 Git SHA。用户书籍目录中的已有 PDF/JSON/SQLite SHA 不变。

**未实现、不可提前承诺：** 两表 N View 架构及 V1 所有窗口、拖拽、纠错、翻译等业务功能，须在下一阶段独立规划、构建和验收。
