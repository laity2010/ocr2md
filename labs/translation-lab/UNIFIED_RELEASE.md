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

部署前单独运行 `python3 -m unittest discover -s tests -p test_v6_lab_unified_publish.py`。发布器校验所有资源类型、路径、符号链接和 Git 构建标识，先完整 staging+全资源散列复验后替换统一发布根；不在 Lab 用户数据目录读写。上线后验证公网与内网 `GET /labs/release-manifest.json` 的 `releaseId` 一致，再比对模块 JS/CSS 资源的 SHA-256。内网静态响应还需携带一致的 `X-OCR2MD-Lab-Release`；公网 Cloudflare 会移除自定义响应头、向 HTML 注入 Cloudflare Analytics 脚本，故公网 HTML 原始字节不完全等于内网，**不能以公网 HTML 的字节哈希直接作为是否同一发布目录的判断**。两边仍从同一发布根读取原始资源。

**备份与清理**：首轮迁移完成前不要删旧构建副本；旧字节可由原 Git 构建 SHA 复建。仅在公网和内网都通过同源摘要、真实浏览器及原 API 验证后，清理各工作树可再生的 `dist/`，不使用 `git clean/reset`，也绝不删除源码工作树或 `.runtime`。每个旧 Lab 服务健康页需要版本元数据时，用隔离的 `.runtime/.release-meta/release-version.json`，而不是复制一份完整发布目录。正式 Main 的 `.v6/release` 和 Lab 的 `ocr2md-lab-release` 是两个且仅两个线上静态发布根。

**回退**：还未清理旧副本时，可只在 Agent Link 网关环境中撤销 `OCR2MD_LAB_RELEASE_ROOT` 并运行已知正常 Git 网关版本；再恢复 Main 的 LAN `V6_LAN_LAB_ROUTES` 旧映射。清理后必须从对应 `sourceCommit` 在隔离工作树重新构建，不再依赖常驻的多份旧发布产物。发生不一致时拒绝上线，不允许网关自动读取旧 `dist` 作后备。

## 实施验收记录（2026-11-09）

- 已发布统一根 `~/AgentDock/ocr2md-lab-release/`：`releaseId=ba6c349437181ea38e92f8def7efa396ff934be9e733ec91eda68cfa767b2a4b`；三个模块 270 个静态文件逐一 SHA-256 核对。
- 本地 `4414`、内网 `4443` 和公网 `/labs/release-manifest.json` 皆读取同一 SHA；JS/CSS 字节与统一发布清单一致。Cloudflare 公网 HTML 附加脚本不属于第二份发布目录。
- Chrome 和模拟 iPad 的 WebKit 对四个 Lab 入口及首页回归；分句公网首次并发读取曾见两项静态 JS 的 HTTP 502，但随后的单资源请求均返回 200 并核对 SHA，公网 Chrome 分句页面再次连续 3 次无 502，属于需要持续观察的公网链路不稳定，不能当作完全根除。
- 后端 `V6_STATIC_ROOT` 统一指向各自 `.runtime/.release-meta`（只含版本元数据），直接访问旧静态路径为 404；公网/内网静态均由 Agent Link 网关的唯一发布根提供。
- 八个可再生、被 Git 忽略的旧 `dist/` 仅在上述功能、静态 SHA 和 API 验证后逐一清理。未来重新构建产生的 `dist/` 是**暂存输出**，不可视为新发布根；发布完成后再核验清理。正式 Main `.v6/release/` 始终保持原样。
