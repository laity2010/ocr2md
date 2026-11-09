# OCR2MD Lab 单一静态发布目录（2026-11-09）

**Main 继续使用自己唯一的 `.v6/release/`；全部 Lab 的唯一在线静态发布根统一为**：`~/AgentDock/ocr2md-lab-release/`。

该 Lab 发布根只有一份 `index.html` 首页、一份 `release-manifest.json` 发布记录，以及 `cm-html/`、`sentence-benchmark/`、`translation-lab/` 三个**子路径**（它们是同一个发布目录里的模块资源，不是三个独立发布根）。发布根由 `scripts/v6_lab_unified_publish.py` 唯一写入。严格记录每个来源构建的真实 `baseCommit`、版本号和每个资产文件的 SHA-256；统一 `releaseId` 为这三组资源与首页内容的确定性摘要。**现有实验分支提交不同，统一物理发布目录不意味着已经合并到同一 Git SHA；不得冒称三方业务源码已经同版。**

内外网都只从现有 Agent Link `127.0.0.1:4414` 网关读取静态发布根。公网 `/labs/*` 经同一个网关；内网 HTTPS `:4443/labs/*` 全部转发到同一个网关，不再需要逐模块端口映射。唯一的模块 API→独立 Loopback 后端表由 Agent Link 网关拥有（cm-html 4408、分句 4412、翻译 4415）。后端依旧分别持有自己的 `.runtime` 文档、Gold、PDF、设置或 SQLite；`lab-release` **绝不可包含任何运行数据**。

## 一次发布（无需重建网络）

从具备发布脚本的 OCR2MD 工作树执行；输入必须是 Git 可证实 SHA 的构建输出，禁止借用 Lab 的 `.runtime`：

```
python3 scripts/v6_lab_unified_publish.py \
  --output "$HOME/AgentDock/ocr2md-lab-release" \
  --home ui/labs-unified-home.html \
  --module "cm-html=$HOME/AgentDock/ocr2md-v6/labs/cm-html/dist" \
  --module "sentence-benchmark=$HOME/AgentDock/ocr2md-v6-experiments/sentence-benchmark/labs/sentence-benchmark/dist" \
  --module "translation-lab=$HOME/AgentDock/ocr2md-v6-experiments/translation-lab/labs/translation-lab/dist"
```

部署前单独运行 `python3 -m unittest discover -s tests -p test_v6_lab_unified_publish.py`。发布器校验所有资源类型、路径、符号链接和 Git 构建标识，先完整 staging+全资源散列复验后替换统一发布根；不在 Lab 用户数据目录读写。上线后验证公网/内网 `GET /labs/release-manifest.json` 的 `releaseId` 和静态 `X-OCR2MD-Lab-Release` 完全相同。

**备份与清理**：首轮迁移完成前不要删旧构建副本；旧字节可由原 Git 构建 SHA 复建。仅在公网和内网都通过同源摘要、真实浏览器及原 API 验证后，清理各工作树可再生的 `dist/`，不使用 `git clean/reset`，也绝不删除源码工作树或 `.runtime`。每个旧 Lab 服务健康页需要版本元数据时，用隔离的 `.runtime/.release-meta/release-version.json`，而不是复制一份完整发布目录。正式 Main 的 `.v6/release` 和 Lab 的 `ocr2md-lab-release` 是两个且仅两个线上静态发布根。

**回退**：还未清理旧副本时，可只在 Agent Link 网关环境中撤销 `OCR2MD_LAB_RELEASE_ROOT` 并运行已知正常 Git 网关版本；再恢复 Main 的 LAN `V6_LAN_LAB_ROUTES` 旧映射。清理后必须从对应 `sourceCommit` 在隔离工作树重新构建，不再依赖常驻的多份旧发布产物。发生不一致时拒绝上线，不允许网关自动读取旧 `dist` 作后备。
