# OCR2MD · V2 · 两表逻辑层与 CM6 内存源码工作台（Lab-Frame）

本 WP00 是在已验收的 Lab-Frame SHA `da903ef8e37e98931d4809e65e6052c653be7f1b` 之上重建的独立框架型 V2，保留 Frame 独立授权与 F02 文件读写能力；旧版失败的 WP01～WP03 业务代码已可追溯撤销；当前重新实现的 WP01～WP03 有独立 Git 记录和验证。Frame 公共源码与 Frame 工作树逐字节一致。每轮先读共用 `AGENTS.md`，再读本 README。旧的失败 V2 已归档到 Git 证据标签 `archive/retired-lab-ocr-v2-20261120`；**禁止复制、恢复其旧 SQLite/业务 UI、把旧 V2 假冒当前实现。**

## 单一权威与不可触碰范围

- 源码：`labs/lab-ocr-v2`，分支 `experiment/lab-ocr-v2`；统一门户固定 URL `https://ocr2md.laity.bid/labs/lab-ocr-v2/`。
- 框架：复用 Lab-Frame 的四窗、全局设置、资料目录、Sarasa、状态栏、导航 Tom Select、AG Grid；`ui/frame/*` 和共享 `ui/frame/workspace-io.js` / `scripts/frame_workspace_io.py` 必须与已验收 Lab-Frame **逐字节一致**。仅在 V2 的 Vite 配置内声明精确适配点，适配漂移立即构建失败。V2 不建立新的全局设置、导航实例、AG 实例、权限状态管理器。
- 授权：资料目录只由原全局设置 `workspace.dataDirectory` 保存。复用公共 **F02** `/labs/lab-frame/api/workspace-io/probe` 实测创建→写→读→验证→清理。只有**已保存目录且 F02 读写验证成功**才能触发 MinerU 基础表与逻辑表自动初始化；未保存的选择不能写入 SQLite。
- 原始数据：书籍目录的 MinerU JSON 是不可修改输入。基础表完整原样保留**每个 JSON 源文件的全部原始字节和 SHA256**，任何块级抽取只作为索引与展示；不改原始 JSON、PDF、其他数据库、Main 或其他 Lab 的数据；仅用户明确许可覆盖本工作目录同名的 V2 SQLite；一旦 `logical_block` 非空便禁止因来源变化自动覆盖该 SQLite。
- SQL：工作目录内 `ocr2md.v2.sqlite` 是**唯一允许覆盖**的目标文件。现有 SQLite 为旧逻辑表结构、旧 Schema 或 MinerUJSON 来源变更时，按用户许可**直接重建并原子替换**；相同源且 Schema 合格时直接复用。先在同目录生成新库、验证两表和原始字节，再替换旧文件；转换失败保留旧库。保留原始 JSON、PDF 与所有其他文件不变；如果旧库属于符号链接/硬链接或存在活动 SQLite 日志，则拒绝不安全覆盖。

## WP00 · 两表基线（现有 WP02 逻辑初始化已自动化）

选定书籍目录创建 `ocr2md.v2.sqlite`，用户自选书籍的实际目录由授权决定；**不使用仓库目录、Main 工作区或旧 Lab SQL**。

| 物理表 | 用途 | 当前状态 |
|---|---|---|
| `mineru_base` | MinerU 原始块无损基础表，BlockID 为 1、2、3…的**全局整数索引**；附独立 `blockid=0` 原始源文件档案记录，不作为业务块展示 | 建库时无损导入 |
| `logical_block` | V2 最新逻辑状态，唯一有效 `block_type` 归属，未来由 CM6 驱动 | **随基础表自动初始化**（样本 224 行）；**6 列**，SQL 原样只读，WP04 编辑仅存 CM6 内存，尚未回写 |

**不得新增第 3 张应用物理表，不以 SQL 表保存操作历史。** WP04 已使用 CM6 内存 Undo/Redo，WP05 另行接入经确认的安全 SQL 增量写回。基础表不保存归一化造成的信息损失：`block_json` 保留每个块的完整 JSON 对象，包括额外未知字段与内嵌子块；`source_json_path` 指向输入页与三类原始块组 `preproc_blocks`、`discarded_blocks`、`para_blocks`；`original_bytes` 仅在 `blockid=0` 的档案记录按 Base64 保存源文件的逐字节内容。因此，原始 JSON 文件本身可按字节还原，BlockID>0 的索引不会改变源数据结构。源文件校验 SHA、路径、页索引、页块组、bbox、原始 lines/blocks 等列均可在 AG 基础表中查阅。

## 独立 Frame 授权与目录访问（2026-11-20）

- 目录列表现在直接调用公共 Frame `GET /labs/lab-frame/api/workspace-io/{roots,browse}`；不调用 Main `/api/session`、`/api/workspace/roots` 或 Main 本地端口。Lab-Frame 的 `ui/frame/access-auth.js` 在「工作区 → 资料目录 → 浏览目录」的**同一目录树区域**展示访问码输入框与「授权 Frame」按钮（不在顶栏、不使用弹窗），用户输入 Frame 独立访问码后，通过私有 F02 session/unlock 签发并校验 7 天 HttpOnly/Secure Cookie，成功即自动加载目录树。
- 权限由 Frame 私有 `ocr2md/.ops/frame-access.json` 的 `0600` 配置、允许的目录白名单和签名会话共同决定，绝不允许无认证读写、路径穿越或打开全盘目录。V2 仅调用 Frame F02 `authorized_roots`、`checked_workspace`、`probe` 公共能力，不另建登录页、权限状态或文件接口。
- Frame 与 V2 手动点击「刷新目录」会重取最新授权根目录（含已置顶的 Obsidian 快捷目录），不会因原有树缓存隐藏新配置。后台轮询仍只更新展开的文件夹内容。
- 在 Main 未启动或编辑授权不可用时，Frame 和 V2 的目录访问与读写不应受其影响；公网与 LAN 的 Cookie 仍分别属于各自站点。用户可以在 Mac 运行 `python3 scripts/frame_access_setup.py --show-code` 获取 Frame 自己的访问码。框架单测与浏览器模拟不代替真实 iPad Safari 验收。

## 业务 API 与窗口

- **单独的 V2 MinerU 业务 API** `/labs/lab-ocr-v2/api/mineru-base/{state,import}`：GET state 支持 `table` 指定物理表并按 120 行分页，返回 `sqlite_master` 枚举的 `tables`（表名及真实列结构）；POST import 仅在目录已授权、Origin 合法、带 `confirm=import-mineru-base`、真实 F02 probe 成功后写入；**新库同一私有 staging 数据库同时建好基础表与逻辑表才一次性发布**，仅对同名 V2 SQLite 做安全原子覆盖；同源非空逻辑表重复请求不写入，旧版同源空逻辑表由该接口原子补全。复用 F02 服务端 `authorized_roots`、`checked_workspace`、`probe`；**不是第二套 Workspace 文件读写 API**，无新监听端口、进程、Tunnel、授权或 Cookie。旧 `/api/v2/` 仍必须 404。
- V2 模块 `ui/v2-mineru-entry.js` **订阅 Frame F02 已验证事件**，仅对已保存目录检查 SQLite。未存在则无损导入，旧 Schema 或逻辑表列结构不兼容则自动重新导入并替换同名库；Schema 合格则加载。返回主工作区不依赖复制另一个 Settings/Navigation。
- 原生导航下拉在验证导入后自动添加 `SQL` 组：**始终展示当前 SQLite `sqlite_master` 中的所有用户物理表（不包括 SQLite 内部表及 View），不按行数或是否已启用业务功能隐藏表**，不再硬编码唯一「基础表」。WP00 当前两张物理表固定为 `基础表 · mineru_base`、`逻辑表 · logical_block`；即使来源没有任何 `para_blocks` 导致逻辑表合法为空，仍可从导航点击并在**原有 AG Grid 实例**显示全部 6 个真实 SQL 字段。`mineru_base` 保持 **18 列**、BlockID 为首列和整数排序，原始归档 `blockid=0` 仅供无损保存不作为业务行展示；所有表均只读，按 120 行分页。导航和 API 通过 SQL 表结构元数据同步，不在导航中增加任何额外应用物理表。
- 当前验收 SQL 物理表导航及**结构/行数据的只读展示**；默认逻辑表与基础表一起初始化完成；逻辑表 `block_type` 是当前唯一类型权威（初始继承基础块，之后可以与 OCR 原始判断不同）。本阶段 AG 仍只读；源码 CM6 在 WP04 已可编辑但变化只在内存，不会持久化到逻辑表。Markdown 预览窗现已复用 V1 原版 `renderMarkdown`，从当前 CM6 内存源码实时渲染；PDF 窗仍为 Frame 空壳，尚无 V1 全套四窗同步。不得把本阶段宣称为完整 V2 或 V1 等价实现。

## WP01～WP03 · 逻辑层与 Markdown 严格往返（2026-11-21）

- **WP01**：已验证纯映射，详见 `docs/v2/WP01_LOGICAL_CONTRACT.md`。初始逻辑只从最终 `para_blocks` 构造（真实样本 224 条），排除前处理/丢弃重复内容；六列只足以表达未经人工确认的扁平状态，暂不自动猜测跨页或父子结构。
- **WP02（已依本轮要求修订）**：在生成 `mineru_base` 的同一 SQL 创建流程中，自动由 `para_blocks` 生成 `logical_block`，只有**两张表都完成**才发布 SQLite；旧 WP00/WP02 已有空逻辑表，在已保存且 F02 验证通过的工作区重新打开时，由同一个受控 `POST import` 接口自动补全，而**不再使用独立 `logical-init` 接口、确认码或「初始化逻辑表」按钮**。相同源非空逻辑表只读保留，来源变更不得擅自覆盖已有逻辑编辑。详见 `docs/v2/WP02_LOGICAL_INITIALIZATION.md`。
- **WP03**：`GET .../api/mineru-base/markdown` 严格从逻辑表只读导出 Markdown + 内存位置清单，核验后可在原有 CM6 **只读**源码窗浏览；不产生用户 `.md` 文件、不插 CMD 标签、不启动 CM6 编辑，也不影响 AG/PDF/MD 预览业务后续航点。`scripts/v2_markdown_roundtrip.py` 有两个公开纯函数 `to_markdown`、`from_markdown`：它们以 Markdown+外部位置信息往返保留全部逻辑行，绝不宣称裸 Markdown 独立可反推原始 MinerUJSON。见 `docs/v2/WP03_MARKDOWN_ROUNDTRIP.md`。
- **WP03 单列类型修正**：`logical_block` 在既有五列末尾仅增加一个 `block_type TEXT NOT NULL DEFAULT ''` 字段。新逻辑块初始取 `mineru_base.block_type`，以后所有当前块类型以 `logical_block.block_type` 为准；OCR 原始类型只保留为只读证据。已存在的五列 SQLite 仅在来源相同、F02 权限验证通过时，通过同一 `POST import` 事务内 `ALTER TABLE` 追加列并映射原始类型；旧文本、ID、顺序、父子关系完整保留，不重新生成 SQL/Markdown，不额外增加审核状态或第三张表。WP03 的 Markdown 位置清单追加 `blockType` 字段，往返格式升级至 `v2-logical-md/v2`。AG 目前只读，未来类型编辑需遵守 CM6/Undo/Redo 航点。见 `docs/v2/WP03_BLOCK_TYPE_CONTRACT.md`。
- 所有原始 MinerUJSON、PDF 和原始基础表仍然不可改；两张物理表与 Frame 共享组件保持不变。

## WP04/18 · 逻辑块连续 CM6 源码窗（只做内存编辑）

- 进入已验证、已保存的工作目录后，自动读取逻辑表全部块并渲染到**原有单一 CM6 源码窗**；每个块文本后追加**一个完整空行**（固定 `\n\n`），包括空逻辑块和最后一块，不再需要点击「查看 Markdown」。逻辑 ID/范围信息位于外部内存映射，源码不插 CMD 标签。
- V1 的 Obsidian/Everforest 配色、标题源码样式、Markdown/HTML/LaTeX 高亮、Sarasa、行号与 iPad 原生文本选区直接复用现有组件；原来 Frame 的 Undo/Redo 按钮已绑定本 CM6 的官方 History，可键入/撤销/重做。
- WP04 `changeFilter` 保护逻辑块之间的空行，禁止跨块删除/合并，避免结构与映射破坏。**全部编辑仅在内存**：重复的工作区验证/AG 视图切换不丢当前 CM6 编辑，页面重载则消失；未新增 SQL 写回操作。原始基础表及逻辑表只读，后续 WP05 实施可测试的增量持久化。详见 `docs/v2/WP04_CM6_SOURCE_CONTRACT.md`。
- **WP04 Markdown 预览修正**：在 Frame 原有 Markdown 预览滚动窗嵌入 V1 的 `article.ocr-markdown`，由 **V1 原版** `ui/markdown-preview.js` 渲染 **当前 CM6 文档**，而非 SQL 旧快照；导入后自动显示、输入/Undo/Redo 后约 180ms 更新，复用 Markdown-it、DOMPurify、KaTeX、代码高亮、Obsidian callout/图片、脚注弹窗和 V1 Everforest CSS。点击带 `data-source-start` 的预览内容可定位现有源码窗；不提前实现 PDF/AG 联动或 SQL 写回。参见 `docs/v2/WP04_V1_MD_PREVIEW.md`。



## 验收与发布（WP00）

1. `python3 tests/test_v2_mineru_base.py -v`：真实 22 页 MinerU 源文件、全部三类根块、原始字节 SHA256 无损、连续整数 BlockID、唯一两表、`sqlite_master` 枚举与逻辑表 6 列及旧 5 列保留数据迁移、安全表名校验、重复导入幂等、旧 Schema、九列逻辑表和源变化可安全原子替换。
2. `node tests/v2-mineru-base.browser.test.mjs`：Chromium/WebKit、Settings 保存权限、自动导入、SQL 原生下拉同时展示两张物理表，自动生成的逻辑表六列/224 行（样本）与基础表 18 列/分页。
3. `node tests/v2-clean-frame-isolation.test.mjs`：逐字节共享 Frame 基线不变；旧 V2 组件不复活。
4. WP04 `node tests/v2-block-source.test.mjs` 和 `node tests/v2-block-source-fixture.test.mjs`：一个空行的块间距、真实224块含9空块/Emoji UTF-16、内存区间与跨块编辑保护；`node tests/v2-mineru-base.browser.test.mjs`：自动 CM6 文本、V1 标题样式和原版 MD 预览（Math/HTML/脚注/callout）、输入/Undo/Redo 实时联动、iPad WebKit、DOMPurify 安全以及 SQL 不写入。
5. Frame 独立授权、F02、设置/导航、统一 Lab 发布与网关限制必须回归；未授权请求 HTTP 403，旧 API HTTP 404；没有用户自己的已授权浏览器 Cookie，不可谎称对其真实工作目录已经完成 SQL 创建。
6. Git 提交完成后 `npm exec vite build -- --config labs/lab-ocr-v2/vite.config.mjs`，使用 `python3 scripts/v2_frame_publish.py --release-root /Users/daisor/AgentDock/ocr2md/release` 发布，核对 `sourceCommit`、所有资源 SHA、其余六 Lab 不变和公网入口 200。
