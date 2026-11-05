# OCR2MD · 内部 AM/Git 基线审计原始报告

- **受审 SHA（冻结、未改写）**：`9c47e44f1fc6b44b4f126030d68008854aced6ca`
- **阶段**：2026-11-05 PDF 版面元素标定（标题、文本块、非法断行、LaTeX、媒体、注释对）
- **平台**：macOS ARM64；Node.js v23.11.0、Python 3.13.3、Playwright 1.64.1；Chromium/WebKit 启动预检均通过
- **运行入口**：`bash tests/am/run-standard-audit.sh 9c47e44f1fc6b44b4f126030d68008854aced6ca`；固定 SHA 隔离工作树，源仓库及用户文档均未作为写入测试目标
- **当前总体结论**：`FAIL: CONTRACT_REGISTRY_INTEGRITY`（全量 AM/Git 未认证）；另有 `REVIEW_REQUIRED` 动态交互和 Linux 独立平台复核

## 原始结果（修复前，不删除失败证据）

1. **Git**：`git fsck --full --no-reflogs` 退出码 0；仅输出 4 个 dangling blob 提示，不代表历史损坏。源码固定、工作树干净。
2. **准备**：审计端口预检通过；npm 依赖安装、MinerU 转换器构建、Chromium/WebKit 实际启动预检与 Vite 构建通过。完整入口执行会话在构建完成后因执行器等待上限终止，未完成 `run-all/certify`，因此这项运行不能视为全量 PASS。
3. **AM 严格数据库构建**：在完全冻结的同一 SHA 上直接执行 `python3 tests/am/am.py build`，退出码 1：`CHECK constraint failed: visibility IN ('export','returned','internal','raw')`。没有通过放宽数据库 Schema 伪造通过。
4. **SQL 分段诊断**：15 个登记语句被拒；首要根因包括四处 `visibility` 非法值批次（`registry.sql` 1538、1575、1587、1596 附近）与一处重复 `apis.id`（1607 附近），其余主要是引用缺失造成的级联外键错误。详细见 `sql-diagnostics.json`。受影响 API 包括 `G30/P23/L81`、`P25/L83`、`L84`、`G32`、`C63/C64/C65/P26`。只证明登记表不可用，不凭此直接判定业务实现存在同等数量缺陷。
5. **统一报告生成器**：`tests/am/standard_audit.py` 也因 `audit_boundaries.load_registry()` 读取相同违规登记表而以 SQLite IntegrityError 退出；未生成正式 `report.json`。不能编造该报告。
6. **定向功能纯测**：六项测试全部退出 0，覆盖 note-pairs、CMD 非法断行审阅、原生 PDF 子块恢复、PBS 数字排序、文本块页范围、LaTeX 边界。详见 `targeted-redacted.log`。
7. **AM Python 边界负向测试**：发现 40 项，其中 34 项 ERROR、1 项 skipped；错误主要由前置 SQL 登记加载失败连锁引起，不能当作 34 个互相独立的模块缺陷。见同一日志。

## 修复与独立复核要求

- 优先独立调查 `registry.sql` 的非法 visibility 与重复 API ID：**不能**放宽 `schema.sql` 的约束、删除测试、掩盖初始失败或仅注册未验证的越界调用来洗白。
- 修复必须在独立 `fix/*` 分支留下 commit、原始失败证据及修复后的 `am.py check/coverage/edges/run-all/certify` 和同一 `run-standard-audit.sh` 完整实测结果。调整契约后受审 SHA 必须更新，不能沿用本轮冻结 SHA 的 PASS。
- Grok、Muse 应从已公开并匿名冷克隆核验的 `audit-public-pdf-elements-9c47e44` 交付包独立获取**同一受审 SHA**，分别进行静态/动态边界、Chrome/WebKit 与各自 Linux/macOS 的可执行验证，独立提交报告和必要修复，不引用本报告替代自己执行。
- **SOURCE_MERGE：待修复与复核**；**PRODUCTION_CUTOVER：不通过**。本轮不移动远端 `main`，不更改开发站点与原始用户文档。

### 证据说明

`precheck.log`、`targeted-redacted.log` 和 `sql-diagnostics.json` 均来自上述冻结 SHA；公开副本仅对测试日志的主机绝对路径做了隐私替换，本机完整日志仍保存在被隔离审计的 `.v6/audit-reports/`，未修改任何真实测试结果与断言。
