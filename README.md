# OCR2MD · V2 · MinerU 无损基础表（Lab-Frame）

本项目是从已验收 Lab-Frame SHA `bf03bfd13db9be9951776f7e4a393f9052221676` 建立的**隔离框架型 V2**。每轮先读共用 `AGENTS.md`，再读本 README。旧的失败 V2 已归档到 Git 证据标签 `archive/retired-lab-ocr-v2-20261120`；**禁止复制、恢复其旧 SQLite/业务 UI、把旧 V2 假冒当前实现。**

## 单一权威与不可触碰范围

- 源码：`labs/lab-ocr-v2`，分支 `experiment/lab-ocr-v2`；统一门户固定 URL `https://ocr2md.laity.bid/labs/lab-ocr-v2/`。
- 框架：复用 Lab-Frame 的四窗、全局设置、资料目录、Sarasa、状态栏、导航 Tom Select、AG Grid；`ui/frame/*` 和共享 `ui/frame/workspace-io.js` / `scripts/frame_workspace_io.py` 必须与已验收 Lab-Frame **逐字节一致**。仅在 V2 的 Vite 配置内声明精确适配点，适配漂移立即构建失败。V2 不建立新的全局设置、导航实例、AG 实例、权限状态管理器。
- 授权：资料目录只由原全局设置 `workspace.dataDirectory` 保存。复用公共 **F02** `/labs/lab-frame/api/workspace-io/probe` 实测创建→写→读→验证→清理。只有**已保存目录且 F02 读写验证成功**才能触发 MinerU 初始化；未保存的选择不能写入 SQLite。
- 原始数据：书籍目录的 MinerU JSON 是不可修改输入。基础表完整原样保留**每个 JSON 源文件的全部原始字节和 SHA256**，任何块级抽取只作为索引与展示；不改原始 JSON、PDF、其他数据库、Main 或其他 Lab 的数据；仅用户明确许可覆盖本工作目录同名的 V2 SQLite。
- SQL：工作目录内 `ocr2md.v2.sqlite` 是**唯一允许覆盖**的目标文件。旧 Schema 不兼容或原始 MinerUJSON 有变时，按用户指令**无提示直接重建并原子替换**；相同源且 Schema 合格时直接复用。先在同目录生成新库、验证两表和原始字节，再替换旧文件；转换失败保留旧库。保留原始 JSON、PDF 与所有其他文件不变；如果旧库属于符号链接/硬链接或存在活动 SQLite 日志，则拒绝不安全覆盖。

## 2 表 N View · 当前数据结构（已实现部分）

选定书籍目录创建 `ocr2md.v2.sqlite`，用户自选书籍的实际目录由授权决定；**不使用仓库目录、Main 工作区或旧 Lab SQL**。

| 物理表 | 用途 | 当前状态 |
|---|---|---|
| `mineru_base` | MinerU 原始块无损基础表，BlockID 为 1、2、3…的**全局整数索引**；附独立 `blockid=0` 原始源文件档案记录，不作为业务块展示 | 每次数据库重建时无损重新导入 |
| `logical_block` | V2 最新逻辑状态，未来由 CM6 驱动 | 当前空表，未实现编辑 |

**不得新增第 3 张应用物理表，不以 SQL 表保存操作历史。** CM 将来负责撤销/重做和历史（本阶段尚未接入）。基础表不保存归一化造成的信息损失：`block_json` 保留每个块的完整 JSON 对象，包括额外未知字段与内嵌子块；`source_json_path` 指向输入页与三类原始块组 `preproc_blocks`、`discarded_blocks`、`para_blocks`；`original_bytes` 仅在 `blockid=0` 的档案记录按 Base64 保存源文件的逐字节内容。因此，原始 JSON 文件本身可按字节还原，BlockID>0 的索引不会改变源数据结构。源文件校验 SHA、路径、页索引、页块组、bbox、原始 lines/blocks 等列均可在 AG 基础表中查阅。

## 业务 API 与窗口

- **单独的 V2 MinerU 业务 API** `/labs/lab-ocr-v2/api/mineru-base/{state,import}`：GET state 支持按 120 行分页；POST import 仅在目录已授权、Origin 合法、带 `confirm=import-mineru-base`、真实 F02 probe 成功后写入；仅对同名 V2 SQLite 做原子覆盖；重复相同输入只读返回现有计数。复用 F02 服务端 `authorized_roots`、`checked_workspace`、`probe`；**不是第二套 Workspace 文件读写 API**，无新监听端口、进程、Tunnel、授权或 Cookie。旧 `/api/v2/` 仍必须 404。
- V2 模块 `ui/v2-mineru-entry.js` **订阅 Frame F02 已验证事件**，仅对已保存目录检查 SQLite。未存在则无损导入，旧 Schema 不兼容则自动重新导入并替换同名库；Schema 合格则加载。返回主工作区不依赖复制另一个 Settings/Navigation。
- 原生导航下拉在验证导入后，自动添加 `SQL` 组与唯一条目 `基础表 · mineru_base`；从全局设置里点击该条目进入主四窗，AG 采用同一个现有 AG Grid 实例展示基础表的 **18 个 SQLite 列**。BlockID 固定为首列，按整数排序，每页 120 行；顶栏按前/后页切换。
- 当前仅验收**基础表导航和 AG 字段**；CM6 源码窗、Markdown 预览、PDF 窗仍为 Frame 空壳，未实现 V1 的编辑/预览/同步、逻辑表展示、转换 Markdown。不得把本阶段宣称为完整 V2 或 V1 等价实现。

## 验收与发布

1. `python3 tests/test_v2_mineru_base.py -v`：真实 22 页 MinerU 源文件、全部三类根块、原始字节 SHA256 无损、连续整数 BlockID、唯一两表、重复导入幂等、旧 Schema 和源变化可安全原子替换。
2. `node tests/v2-mineru-base.browser.test.mjs`：Chromium/WebKit、Settings 保存权限、自动导入、SQL 原生下拉和 AG 18 列/分页。
3. `node tests/v2-clean-frame-isolation.test.mjs`：逐字节共享 Frame 基线不变；旧 V2 组件不复活。
4. 原 Frame 公共 F02、设置/导航、统一 Lab 发布与网关限制必须回归；未授权请求 HTTP 403，旧 API HTTP 404；没有用户自己的已授权浏览器 Cookie，不可谎称对其真实工作目录已经完成 SQL 创建。
5. Git 提交完成后 `npm exec vite build -- --config labs/lab-ocr-v2/vite.config.mjs`，使用 `python3 scripts/v2_frame_publish.py --release-root /Users/daisor/AgentDock/ocr2md/release` 发布，核对 `sourceCommit`、所有资源 SHA、其余六 Lab 不变和公网入口 200。
