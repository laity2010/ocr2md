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

**范围与诚实口径**：截至 2026-10-23 本轮增量审计登记 7 个模块、93 个 API、8 类消息、13 个发布入口、17 个订阅处理者、134 条测试契约、37 条代表性调用（其中 1 条仅用于 DEV 测试）。数量以 `registry.sql` 和 `am.py` 实时查询为准，不应写死在单测断言中。多数既有剧本仍是 `integration`：仅证明该用例触及功能，**不是直接调用每个 API 的孤立测试，也不等于 K 表标准答案已冻结**。`coverage` 只统计路径绑定；真实执行结果只统计 `test_runs`。

**安全边界**：AM 用 SQLite 做 AI 的检索索引，不改 V6 运行时；单项测试沿用原脚本自身的测试隔离实现，切勿将正式 `.v6/workspace/buffetts-alpha.minerujson.md` 作为写入测试输入。PDF 现阶段是本机 `.v6/workspace/` 的只读副本，尚不是便携测试夹具。全表验收按脚本去重实际运行，每条契约只对其引用脚本的真实运行结果登记 PASS/FAIL。一个脚本同时承担多个集成契约不等于每项都有独立单元测试。`certify` 验证当前 Git commit 全部已登记结果，通过后仍不得夸大为“逐 API 独立单测/独立黄金文件均已认证”。

历史 Git 冻结标记 `v6-feature-freeze-20261022`；当前 V6 构建号以正式服务 `/healthz` 为准。主线生产代码和发布站点不依赖此 AM 索引。
