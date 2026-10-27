# AM · AI-readable API and Message registry (V6)

此目录是当前 V6 七组件 CMD / AG / MD Preview / PDF Preview / Layout / Media / LaTeX 的**实际代码审计索引**，不是业务数据库、第二份 Markdown、第二套 Zustand，也不是 `AGENTS.md` 工程规范。

- `schema.sql`：9 张关系表和外键约束（含跨模块调用及历史架构发现记录）。
- `registry.sql`：Git 管理的**唯一可编辑 AM 契约数据源**，根据冻结基线 `0733abb` 的实际源码审计所得。标记 `raw`、`internal` 的记录代表**已经存在但尚未收敛成正式公开 API**，不意味着鼓励依赖。
- `am.py`：生成并读取 SQLite，核对外键、源码路径、API 符号名及测试脚本；用真实已有脚本执行单个注册测试，并记录结果。
- `.v6/tests/am.sqlite`：由 SQL 确定性生成、Git 忽略的查询索引；禁止直接手改作为正式契约。测试结果 `test_runs` 属本地执行证据，不进入生产发布。

从项目根目录执行：

```sh
python3 tests/am/am.py build                 # 首次/SQL 内容更新后重建本地数据库
python3 tests/am/am.py modules               # 查看当前模块登记
python3 tests/am/am.py apis C                # CMD 对外可见接口
python3 tests/am/am.py apis L                # Layout 包装与 raw 泄漏项
python3 tests/am/am.py route focusTarget     # 谁发布？谁接收？内部 handler 和触发过滤规则？
python3 tests/am/am.py impact P              # 改 PDF 模块会涉及哪些 API/消息？
python3 tests/am/am.py edges debt           # 仍在发生的边界债务；登记不代表已批准
python3 tests/am/am.py edges test_only      # 仅开发测试环境开放的原生对象
python3 tests/am/am.py cases C05             # 找到该 API 对应的脚本、输入、验收要求
python3 tests/am/am.py run TC-C05            # 真实运行该隔离测试，结果写 test_runs + 本地日志
python3 tests/am/am.py untested              # 查找未绑定 API、消息、发布及订阅测试
python3 tests/am/am.py coverage              # 测试引用覆盖，而不是通过率
python3 tests/am/am.py check                 # 数据库外键和源码/脚本路径校验
python3 tests/am/am.py run-all               # 各已登记脚本去重运行，分别登记契约结果
python3 tests/am/am.py certify               # Git 源码/测试树未改变时验证当前全部契约
python3 -m unittest discover -s tests/am -p 'test_*.py'
```

**跨模块审计**：`access_edges` 记录查实的调用位置及分类（`registered` 已登记 API 调用 / `debt` 既有直接依赖 / `test_only` 仅 DEV 调试对象、生产不可见）。历史债务已处理，`edges debt` 当前为零，但不表示全项目绝对没有未发现耦合。已登记的调用只是优先核实的**代表性调用，不代表所有跨模块路径均已扫描完毕**。日常核查应以 Git 增量为范围，结合源码检查，不能把 `edges` 查询误当完整静态分析器或硬性门禁。

**验收证据**：正式规范、审计报告或本说明的纯文档提交，不取消代码/测试树与固定夹具完全相同的历史 PASS；业务代码、测试脚本、AM Schema/登记与测试关联变化则必须重新验收。重建 SQLite 时若某用例换绑 API / 消息对象，即使编号不变，也不得沿用原 PASS；发现未提交的测试源码变动，不允许认证。

**范围与诚实口径**：截至本轮全量审计登记 7 个模块、98 个 API、8 类消息、13 个发布入口、17 个订阅处理者、139 条测试契约、42 条代表性调用（其中 1 条仅用于 DEV 测试）。数量以 `registry.sql` 和 `am.py` 实时查询为准，不应写死在单测断言中。多数既有剧本仍是 `integration`：仅证明该用例触及功能，**不是直接调用每个 API 的孤立测试，也不等于 K 表标准答案已冻结**。`coverage` 只统计路径绑定；真实执行结果只统计 `test_runs`。

**安全边界**：AM 用 SQLite 做 AI 的检索索引，不改 V6 运行时；单项测试沿用原脚本自身的测试隔离实现，切勿将正式 `.v6/workspace/buffetts-alpha.minerujson.md` 作为写入测试输入。PDF 现阶段是本机 `.v6/workspace/` 的只读副本，尚不是便携测试夹具。全表验收按脚本去重实际运行，每条契约只对其引用脚本的真实运行结果登记 PASS/FAIL。一个脚本同时承担多个集成契约不等于每项都有独立单元测试。`certify` 验证当前 Git commit 全部已登记结果，通过后仍不得夸大为“逐 API 独立单测/独立黄金文件均已认证”。

历史 Git 冻结标记 `v6-feature-freeze-20261022`；当前 V6 构建号以正式服务 `/healthz` 为准。主线生产代码和发布站点不依赖此 AM 索引。

## WP3 · 主线跨平台 AM/Git 审计入口（Mac 与 Linux）

保持现有 AM 七个模块、98 个 API、139 条业务契约及单份 `registry.sql` 不变。
`audit_boundaries.py` 从 `ownership.json` 补充读取 **27 个 `ui/*.js` 实现文件归属**（不是新增 20 个业务模块），检查静态相对导入、具名符号、共享库允许消费者与已知的直接状态写入。`am.py check`、`run-all` 和 `certify` 会执行这个只读检查；`test_boundaries.py` 提供九项故意越界负向测试。此类静态检查不宣称能证明运行时所有调用、动态事件总线和 DOM 耦合完全解耦。`outlineCount` / `activePanel` 两处既存直写仍列为后续审阅项。

派单、审计者读取回执和报告规范参阅仓库根目录 [AUDIT.md](../../AUDIT.md)；两个 AI 使用相同测试入口，Issue 不是执行回执。

**唯一全量审计入口**（旧命令名保留，便于 Grok/Muse 独立调用）：

```sh
bash tests/am/run-grok-audit.sh "$(git rev-parse HEAD)"
```

该命令拒绝脏的主线工作区与 Git SHA 不匹配，不在真实工作目录运行测试。它创建一个同 SHA 的**隔离 detached worktree**，只复制只读 PDF 样本进隔离环境，将母本 Markdown 初始化为测试专用副本，再在其中执行 27 套件/139 AM 契约，运行后查验 Git 完整性。可设置 `OCR2MD_AUDIT_TARGET_DIR=/absolute/new/path` 为本轮指定新的隔离工作区；遇到旧 SHA 或文件改动直接 BLOCKED，而不是自动覆盖或 `reset --hard`。

跨平台差异仅存在 `tests/am/portability/`，包括 Python 端口预检、真实 Chromium/WebKit 动态库检查、Node 测试适配器、Linux `sips` → 真实 Chromium JPEG 转换、WebKit 本地 HTTP 授权 Cookie 适配与 reload 取证。授权适配**不进入生产**；本地 HTTP 验收不代表正式 HTTPS 授权验收。测试所需 PDF 路径及 SHA 由既有 `tests/k/data.json` 标定，审计前须将同份 PDF 放在工作区的 `.v6/workspace/buffetts-alpha.original.pdf`，Linux 也一样；不把实际用户工作文档当测试输入。浏览器缺库时报告环境 BLOCKED 而不假造业务测试 FAIL。Linux 可在具有适当权限的隔离容器中设置 `OCR2MD_AUDIT_INSTALL_SYSTEM_DEPS=1` 安装系统依赖；可设置 `OCR2MD_AUDIT_SKIP_BROWSER_INSTALL=1` 跳过安装命令，但仍须通过真实启动预检。

WP1/WP2 采用并公开记录了三项测试契约修订：`tests/scroll-sync-browser.test.mjs` 基于用户请求的行 600 检查滚动前进；`tests/latex-browser.test.mjs` 等待实际 KaTeX 渲染就绪再执行原断言；`tests/media-paste-browser.test.mjs` 对本地只读媒体 GET 的短连接错误至多重试两次，**绝不重试媒体写入 POST**。原有功能结果要求均保留。审计报告必须保留业务提交 SHA、测试提交 SHA、环境、失败日志与独立审阅结论；单次 PASS 不代表所有平台和生产 HTTPS 行为已被证明。


## WP4 · 全局设置首个接口（2026-10-24）

`Settings`（AM 模块 S）提供 `register/get/set/subscribe` 公共 API，其他模块只登记设置定义和 `settings.changed` 订阅，不访问 Settings 内部 AG/CM6。第一个消费者是 CMD 模块 C，暴露 `globalUi.cmSource.defaultFontSize`：分类 `全局 UI → CM 源码窗 → 默认字号`，范围 8–32pt，默认 12pt。AG 显示三级索引，JSON CM6 实例独立于 Markdown，Dockview 预览提供滑条与分类说明；滑条、JSON、字号 CSS 变量和 Undo/Redo 保持双向同步。只有合法设置才发送消息；暂时无效的 JSON 保留源码、不覆盖当前值。保存仅通过 CMD 的 `openCMDJsonSource` / `scripts/v6_cmd_settings.py`，服务器使用同源与编辑 Cookie 认证、原子写与内容指纹防并发覆盖。

新增 `tests/settings-browser.test.mjs` 的 Chromium/WebKit 真实交互回归、`tests/settings-server.test.mjs` 的 HTTP 授权/原子写回归，以及 `tests/am/test_settings_io.py` 的 CMD I/O 负向测试。所有新增边界已登记在 `registry.sql`，文件所有者更新到 `ownership.json`；早期 WP3 的 7 模块/98 API/139 用例仅是历史基线，新的实际数量以 `am.py build` 为准。

**设置模块懒加载修订**：未打开设置时，仅通过 CMD `readCMDJsonSnapshot` 读取有效配置并发出设置变更；不创建第二份 Dockview/CM6，维持原工作台的 3 个面板与单份 `.cm-content`。首次切换到全局设置再装配设置三窗，之后保留该独立编辑状态。旧 29 套件第一次仅 84/151，因隐藏工作台被提前初始化产生重复面板与编辑器节点，以及模块菜单旧三项断言；这些故障均保留为回归证据。


## 全局设置参数记录与三窗定位（2026-10-24）

全局设置使用标准 JSON，格式为 `{"settings":{"globalUi.cmSource.defaultFontSize":{"key":"defaultFontSize","category1":"全局 UI","category2":"CM 源码窗","comment":"所有 CM6 源码窗的默认字号（8–32 pt）","value":12,"range":{"min":8,"max":32,"step":1}}}}`。**每条记录独立包含源码键名、一级分类、二级分类、键注释、当前值和取值范围**。Settings API 的模块注册信息只用于初始值/权限边界；AG 列及预览窗实时读取 CMD JSON 源码中的参数记录。用户修改注释、分类或合法范围后，三窗即时同步；修改值时给订阅模块发送 `settings.changed`，只有显式保存才持久化。

列序固定 `一级分类 → 二级分类 → 键名 → 键注释`，前三列**直接复用章节定界的 `EnumCheckboxFilter` 和 AG 原生过滤按钮、复用 `ag-enum-filter-shared.css` 列头触摸/拖拽几何与弹窗样式**，键注释不设过滤；列宽可调整。AG 行点击调用 CMD 语法树按完整路径定位 `settings[fullKey]`；CM6 中点击任一记录字段/注释/范围都会选择对应 AG 行，必要时重置隐藏该行的过滤。

此前发布的嵌套数值 + `$comments` 旧格式在 Settings 首次打开时经 CMD **一个可撤销的完整文档事务**转换为参数记录；不会自动写入磁盘。已注册键的旧值和注释保留；未登记的其他数据放到 `$legacy` 归档以免丢失。模块随后新登记键时，自动补充一条默认记录（依旧需要用户保存）。CMD 只负责源码的语法树定位、路径精确编辑、撤销及持久化，不解释设置业务含义。
