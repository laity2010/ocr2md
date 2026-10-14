# ADR-0002 — Obsidian Vault Root 与 OCR 清洗区（2026-10-08）

状态：产品目录模型已按用户反馈确定；WP2 是**内存 Fixture 验收**，实际持久化 Root / iPad 文件桥还未实现。

## 根目录语义

- 一个 **Workspace Mount = 一个 Obsidian Vault Root**。初始目录始终为 Vault 的逻辑 `/`。
- 用户配置具体的 Root 位置（Mac 为获准的本地目录、iPad 为未来持久的文件授权/Native 桥接），不把宿主的绝对路径暴露给业务模块。
- Obsidian 的 `.obsidian/` 由 Obsidian 管理；目录 UI 可以隐藏它，实际写入后端必须阻止 OCR 清洗/导出流程修改其配置内容。
- `/ocr2md/` 是 Vault 内清洗区，下面每一本书对应独立工作目录；这是**保留的标准清洗区名称**，而不是挂载 Root。
- `/阅读/`、`/学习/` 等是 Vault 根级**示例分类目录**，由用户自己确定。不能写死在 Workspace FS 协议。
- 清洗项目目录内包含 PDF、MinerU JSON、Markdown、章节及媒体等，细节留给章节业务管理。
- 清洗完成时，通过显式 Export 业务将可阅读 Markdown（包括必要媒体与引用）**复制生成**到用户选择的根级分类目录。不得把清洗区直接移动走、覆盖已有成品或暴露临时索引。
- 一个 Root 可以同时既供 ocr2md 清洗，也供 Obsidian 阅读和记笔记。跨 iCloud/Unison/GD 同步以 Vault 目录为边界，继续维护已有外部同步链路；对 `.obsidian` 的排除设定不由这次 WP2 改动。

示例（Obsidian 库本身可能名为 `ocr2md`，同名子目录是另一层）：

```text
<ObsidianVaultRoot>/
├─ .obsidian/             # Obsidian 配置，应用保护
├─ ocr2md/                # 原始文件 + 待清洗项目
│  ├─ 书籍A/
│  └─ 书籍B/
├─ 阅读/                  # 成品示例分类（名称由用户配置）
└─ 学习/                  # 成品示例分类（名称由用户配置）
```

## WP2 展示与验收范围

网页 `https://ocr2md.laity.bid/v3-directory/` 的 `vault-primary:/` 是**模拟 Obsidian 库的根目录**，首次打开可见 `ocr2md/`、`阅读/`、`学习/`。点击 `ocr2md/` 可见 `示例书A/`、`示例书B/`；`阅读/` 下提供一个示例成品文件。这个文件**是种子样本，不是已经实现了 Export**。

第二个 `vault-secondary:/` 只是验证切换不同 Vault Root 的测试夹具；真实设备是否支持 Root 选择、书签、权限回收与持久化，由 WP3（Mac）和 WP6–WP8（iPad）分别验收。

**禁止把模拟数据修改成功宣传为已保存真实 Obsidian 文件**。刷新网页全部重置，这一性质是刻意的。

## 后续合同边界

- WP3：Mac Root 绑定到经过授权的本地 Obsidian 库目录，路径与越界防护、冲突保存、SQLite 私有索引；真实数据迁移必须人工确认。
- WP4：章节导入以 `/ocr2md/<workdir>/` 为根；Markdown/PDF/JSON 文件通过统一 Workspace FS 读取。
- 导出业务（在 WP4/5 逐步接入）：`source = /ocr2md/<workdir>/` → `target = /<user-category>/`，带预览、文件冲突保护及媒体路径调整；此操作应归 Export Service，而非 DirectoryController 特殊行为。
- WP6–WP8：iPad Safari 仅有私有 OPFS 存储，不能将网页演示误认为已获得 Obsidian iCloud Vault 目录持续访问权限。根据实机验证按需添加 WKWebView/Swift 文件桥。
- WP9：Mac/iCloud/Unison/GD 同步与跨设备内容冲突复核，SQLite/WAL、预览缓存保持设备私有。
