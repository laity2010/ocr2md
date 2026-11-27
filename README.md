# Lab-Translation · 校译州

## 当前可运行基线（WP01，继承 WP00）

独立工作树 `experiment/lab-translation`，从已验收的 lab-frame `1dbc2b7e4c754330b8d3b365008e4c2e9edc39c9` 建立；不是旧 `translation-lab` 的覆盖升级，也不是 Main 镜像或晋升候选。公共 Frame 布局和组件契约不变，本州接线仅涉及 frame.js/layout.js；Vite 精确适配品牌、自动更新身份和本州浏览器设置命名空间。默认打开全局设置，未绑定时业务窗格为空，导航只含 settings.json，继承保存、Undo/Redo、Sarasa、目录选择及共享 F02 权限。WP00 不加载或初始化任何书籍 SQL，不生成 trans，不读写正文，不接入 AI。原 Frame PDF 空白占位在 WP04 才按已约定功能替换。

唯一正式入口 `/labs/lab-translation/`，通过统一 `release/` manifest 与门户登记；使用现有网关和 `/labs/lab-frame/api/workspace-io/` 公共 F02，不增加端口或 Tunnel。浏览器设置键 `ocr2md.lab-translation.settings.json.v1`，不读取 Frame、V2 或 Sentence 的设置。F02 授权仍由 Frame 的独立签名会话及目录白名单负责；用户主动选择目录时才按 Frame 约定探针，WP01 不自动读取 SQL。

## WP01 · 已保存原句表只读接入

唯一来源为 Sentence 州 WP04F6（`c95b739`）公开 `GET /labs/lab-sentence/api/sentence/snapshot?workspace=...`；不访问其私有表，不调用可能初始化/迁移的 `open`。共享 F02 目录授权及原 Frame 读写权限探针保持原样（探针临时文件由 F02 管理，不是 SQL 写入）；只有验证成功的目录才出现 SQL → 初始化原句表（只读）。显式初始化后成功才出现 SQL → 原句表 · sentence（只读）并切换四窗业务区，AG 显示全部原始 12 列（MDLine、句序、raw、type、level、状态及来源等）；CM/MD/PDF 暂时仍空白。原句表为已保存快照的内存只读引用，不复制建表或写 SQLite，也不存入浏览器持久层。刷新页面重新初始化；同目录可再次初始化刷新已保存仲裁，换目录/解绑/读取失败立即清除旧引用和表导航，忽略迟到响应；同目录重新读入保持 AG 原生过滤模型。原句行和候选元数据均按上游返回，不修改；显示以 AG 单元格文本方式，不将 HTML 当作可执行标记。对原句原文 SHA 和完整句记录 SHA 做独立校验。

| 接口 | 契约与测试 |
|---|---|
| `readOriginalSnapshot(workspace,{fetcher,signal})` | 仅同源 GET，凭据与 F02 一致，不缓存；验证 schema、字段、身份、顺序、UTF-16 和两项 SHA；错误拒绝。`tests/translation-original.test.mjs` |
| `createOriginalSession({reader,onChange})` | `initialize(workspace)` 只读引用，`invalidate()` 清除旧代及取消请求，`current` 为冻结快照；无写入。直接测试同上。 |
| `createFrameWorkspace.setOriginalRows(rows|null)` | AG 只读展示或恢复空白框架，沿用 V1 EnumCheckboxFilter（type、level），不更改窗格或源码；`tests/cross-version-ag-filter.browser.test.mjs` 验证真实 UI。 |

公共导航、设置、目录授权、Frame 布局、Undo/Redo 位置保持不变。原句表不支持编辑；校译州的译句实体表及保护识别待 WP02。正式发布器启用联邦实际浏览器 Type 过滤门禁。

## 已确定的后续执行边界（尚未实现）

- WP02：在原句上识别保护范围，生成本州译句表并在 AG 展示，整句不可译仍保留。保护范围覆盖 Markdown 结构、LaTeX、代码、URL/媒体、脚注、HTML 标签属性、结构空白等；自然语言内容不因标签而丢失。具体识别策略、存储字段及回填规则需按 WP02 测试确认。上游内容不可写。
- WP03：源码 CM6 只读显示由原句无损重构的 MDLine；MD 预览按此渲染，两窗淡化不翻译内容，不删除或改写字符；AG、源码与预览共享位置映射。未校译 RAW 重构需逐字符往返一致。
- WP04：预览下拉移除 PDF 与相关拆分控制，保留 MD 预览并增加翻译 Prompt，切换显示可编辑 CM6；其编辑历史独立，默认统一校译任务书。保留已验收公共布局及导航位置，不自行改变其他界面。
- WP05：指定目标语言；在书籍工作目录 trans/ 导出 sentences.json 与 prompt.md。整 MDLine 作为 AI 上下文、按既定句序输出；保护元素、来源/分句摘要、任务身份验证及无损回填。外部 AI 经 AgentDock 领取同一输入和提示词，只写自己的 AI_ID.json，逐句返回 corrected（拼写/OCR 校正，不润色）和 translated（基于校正后原文的指定语言译文），不得跨句移位或改动保护元素。文件生成和更新不得覆盖已有外部结果；具体冲突策略待该航点确认。
- 后续独立航点：验证导入多 AI 结果、保留所有译文、仅对校正分歧仲裁；未校正/未翻译如实标记，基于未采用校正的译文标明来源差异。最终按原句身份生成一份校正原文、多份译文的句级交叉互译文档，原句与上游始终不变。尚未确定最终校译存储 schema，不提前建额外表。

## 构建与验收

联邦 START 远端同步后，`node node_modules/vite/bin/vite.js build --config labs/lab-translation/vite.config.mjs`；`node tests/translation-frame.browser.test.mjs` 验证实际构建的双浏览器空框架、导航、独立设置、发布身份及跨州更新隔离。WP01 运行 `node --test tests/translation-original.test.mjs` 与既有设置/I/O 回归；`node tests/cross-version-ag-filter.browser.test.mjs` 在实际构建上验证两浏览器原句表初始化、只读显示、原生 Type 过滤、同目录刷新及换目录/失败清理。联邦布局检查与 `verify_cross_version_components.py --target lab-translation --browser` 为正式发布门禁。提交干净源码后重新构建，用 `python3 scripts/translation_frame_publish.py` 复用 Frame 正式发布器；随后检查线上 SHA、版本、manifest 文件哈希及其他 Lab 不变，完成联邦 END。真实 iPad 仍需用户验收。
