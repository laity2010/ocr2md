# AM · AI-readable API and Message registry (V6)

此目录是当前 V6 五组件 CMD / AG / MD Preview / PDF Preview / Layout 的**实际代码审计索引**，不是业务数据库、第二份 Markdown、第二套 Zustand，也不是 `AGENTS.md` 工程规范。

- `schema.sql`：7 张关系表和外键约束。
- `registry.sql`：Git 管理的**唯一可编辑 AM 契约数据源**，根据冻结基线 `0733abb` 的实际源码审计所得。标记 `raw`、`internal` 的记录代表**已经存在但尚未收敛成正式公开 API**，不意味着鼓励依赖。
- `am.py`：生成并读取 SQLite，核对外键、源码路径、API 符号名及测试脚本；用真实已有脚本执行单个注册测试，并记录结果。
- `.v6/tests/am.sqlite`：由 SQL 确定性生成、Git 忽略的查询索引；禁止直接手改作为正式契约。测试结果 `test_runs` 属本地执行证据，不进入生产发布。

从项目根目录执行：

```sh
python3 tests/am/am.py build                 # 首次/SQL 内容更新后重建本地数据库
python3 tests/am/am.py modules               # 5 个实际模块
python3 tests/am/am.py apis C                # CMD 对外可见接口
python3 tests/am/am.py apis L                # Layout 包装与 raw 泄漏项
python3 tests/am/am.py route focusTarget     # 谁发布？谁接收？内部 handler 和触发过滤规则？
python3 tests/am/am.py impact P              # 改 PDF 模块会涉及哪些 API/消息？
python3 tests/am/am.py cases C05             # 找到该 API 对应的脚本、输入、验收要求
python3 tests/am/am.py run TC-C05            # 真实运行该隔离测试，结果写 test_runs + 本地日志
python3 tests/am/am.py untested              # 尚无可定位测试的 API/消息
python3 tests/am/am.py coverage              # 测试引用覆盖，而不是通过率
python3 tests/am/am.py check                 # 数据库外键和源码/脚本路径校验
python3 -m unittest discover -s tests/am -p 'test_*.py'
```

**范围与诚实口径**：当前录入 51 个 API、8 类跨模块消息、12 个发布入口、15 个订阅处理者；5 个 API 未绑定已有测试，且 `activePanel` 与 `ocr2md:chapter-error` 缺消息测试。多数绑定的原有剧本是 `integration`：仅证明该用例触及功能，**不是直接调用每个 API 的孤立测试，也不等于 K 表标准答案已冻结**。`coverage` 只统计路径绑定；真实执行结果只统计 `test_runs`。每条测试的数据集字段指向其依赖的主要已有样本；正式验收仍需进一步冻结独立预期结果。

**安全边界**：AM 用 SQLite 做 AI 的检索索引，不改 V6 运行时；单项测试沿用原脚本自身的测试隔离实现，切勿将正式 `.v6/workspace/buffetts-alpha.minerujson.md` 作为写入测试输入。PDF 现阶段是本机 `.v6/workspace/` 的只读副本，尚不是便携测试夹具。没有全面运行已关联的 65 个测试条目之前，不得宣称整表通过或接口稳定已获认证。

Git 冻结标记 `v6-feature-freeze-20261022`，V6 正式构建仍为 `v6-20261022-075729`。主线生产代码和发布站点不依赖此 AM 索引。
