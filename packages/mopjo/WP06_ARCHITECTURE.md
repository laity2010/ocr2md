# MOPJO WP06 · 独立源码与 AEL 架构审计

## 冻结与迁移策略

WP06.0 将 WP05 时的 17 个 TS 源码/测试文件及 package.json SHA-256 写入 `WP06_BASELINE.json`；原有验收要求 369 项，不准降低断言。MOPJO 源目录内原有 10 个 TS 文件、1512 行代码，直接通过 14 处导入链接仓库根的 6 个 IR 文件；继续解析 import closure 还需 3 个模块，合计 9 个真实依赖源文件、2208 行。

本航点仅将这 **9 个所需的、实际位于传递依赖闭包中的文件** 原样迁入 `src/ir/`，保留各自校验及变换行为，而非复制 V4 或所有旧 OCR2MD 文件。每份迁入文件与 `WP06_BASELINE.json` 中冻结的原文件 SHA-256 一致。全部 MOPJO 生产和测试源码导入改为本包相对路径；不修改原仓库对应源码。历史算法目前以源码镜像作为迁移初始版本，后续可在 MOPJO 内独立维护和精简，但必须以产品契约与回归保护其行为。

MOPJO 向外提供 CLI 和 `MopjoV4ChapterSession` 端口；不依赖 WCP、V4 内部实现或原仓库根目录的 src。作为 Node/npm 软件包，允许使用 Node 内建 API 和 **明确声明/锁定的第三方开发工具**：TypeScript、esbuild、@types/node。MOPJO 目前仍标记为 private（不发布 npm），与已经可单独安装构建并不矛盾。

## 关键命令

在 `packages/mopjo` 包根目录：

```bash
npm ci --offline                   # 如本机无 npm 缓存可去掉 --offline
npm run verify:boundary           # 静态追踪所有源码与测试的导入关系
node scripts/verify-isolation.mjs --migration-parity  # 仅 WP06 迁移时：逐文件比对9份原算法 SHA
npm test                          # WP1–WP5: 369 项检查 + WP06边界门禁
npm run test:isolated             # 在 /private/tmp 复制“仅MOPJO包”，独立 npm ci + 全套检查
python3 scripts/ael.py check
python3 scripts/ael.py report
```

`test:isolated` **不会**复制主仓库的 `src/`、V4、WCP 或 `node_modules/`；目标目录在主仓库外，执行 `npm ci --offline` 仅安装声明的第三方依赖后，再执行本包测试。真实 Buffett’s Alpha 原始 PDF / IR 仍从 Mac Obsidian **只读**读取作为外部测试资料；全部章节写入、增量操作仅在可删除的临时目录内进行。测试使用非模拟的完整书籍、22 PDF 页、224 逻辑块、315 原始 OCR 证据、6 个章节包。

`verify:boundary` 使用 TypeScript AST 检查 `src/`、`tests/` 的普通/类型导入、re-export、`require()`、动态 `import()`；禁止相对导入逃出本包或调用未声明外部软件包。默认不要求迁入算法永远保持与旧仓库的相同 SHA；`--migration-parity` 是 WP06 的一次性迁移核验，未来允许在 MOPJO 内按契约修改实现。

## 独立 AEL

`scripts/ael.py` **只监测 MOPJO**；它不会读写 `ui-spikes/v4-directory` 的 AEL 或主仓库文件。SQLite 账本位于 `.runtime/ael.sqlite`（本包 `.gitignore` 忽略），初始化时使用冻结的 WP06.0 旧版源码哈希，而不是将当前已迁移代码误当初始基线。

新航点流程（首次初始化已经完成，禁止重复 init）：

```bash
python3 scripts/ael.py check
python3 scripts/ael.py begin --task 'WP07 ...'
# 只修改 MOPJO 内的文件
python3 scripts/ael.py test --name regression -- npm test
python3 scripts/ael.py finish --result passed
python3 scripts/ael.py report
```

AEL 记录每次航点的文件变动数、路径、执行耗时、测试退出码与测试耗时，并提示大面积源文件修改。WP06 的初始一次性迁移属于故意的较大范围变更；若有 `SPREAD`，必须以“移植九个必要 IR 文件”解释，而不能虚称无任何告警。跨模块依赖由 TypeScript AST 门禁独立检测，AEL 的文件快照本身只覆盖 `packages/mopjo/`，**不得将“0 越界”偷换为扫描了所有仓库修改**。

## 验收边界

- **通过方可声明**：仓库外本包重新安装依赖、严格 TS/ESM 构建、WP1–WP5 原有 369 项验收、原始原件 SHA 与输出重放一致。
- **不在 WP06 内**：接线 V4 章节清洗 UI，实施真正的 Vault 多写入者 CAS、三窗浏览器 UIC、上传公网或提交 Git。上述工作仍需独立航点和 V4 AEL。
- 源码量会因合法迁移而增长 2208 行；评估“变面条”时应同时检查 **跨包导入是否归零**、ESM 产物大小与未来 WP 的扩散告警，而不能仅凭行数给出优劣结论。
