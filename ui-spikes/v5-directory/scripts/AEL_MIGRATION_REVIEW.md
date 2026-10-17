# V5 AEL · 纯迁移偏差追溯审计

**职责不变：AEL 只记录、提示、支持纠偏，不约束源代码修改，不阻止构建或发布。** 原始任务 `changes` 表历史记录只读；历史上的 `passed` 代表当时登记测试通过，**不代表迁移行为无偏差**。

## 每次构建后的审计

```bash
cd ui-spikes/v5-directory
python3 scripts/ael.py check       # 包含尚未解决的偏差数与 ID 提示
python3 scripts/ael.py review      # 实际复检当前代码，结果追加存入 migration_reviews
python3 scripts/ael.py report      # 历史任务和未结事项
```

`review` 按未修改的历史任务 ID 输出问题及建议的独立纠偏动作，审计结果只写 `.runtime/ael.sqlite`，不改动任何业务源码。检查依赖源代码/manifest的项目自动识别；需要实际浏览器对照的项目必须保留“待对照”状态，不能把源文件 SHA 相同误判为 UI 行为一致。所有提醒都是 `advisory_only`，不会改变 AEL `passed/partial/blocked` 的原有规则。

新增记录从历史任务补登，不回填或篡改既有 `changes` 行：

- `V5-MIG-UI-001` → Task #7：原 V4 布局/样式未在纯迁移阶段完整保留；构建时分秒标牌仍简化为 `v5-wp2`。优先恢复标牌，再做冻结 V4 与 V5 设备界面对照。
- `V5-MIG-SET-002` → Task #2：用户提出参数名列显示被中文替换。已核对 V4/V5 设置 schema 字节相同、共享组件使用 `parameterName:e.label`；故归因 **待查**。需比较两版 AG 实际单元格字段/显示值，不得直接声称源数据被篡改。
- `V5-MIG-SET-003` → Task #2：设置 schema 暴露三项尚未迁入的章节定界参数。修复时应保留源 schema 证据并通过模块注册契约过滤运行可见项，不应回改 V4 原件。

所有发现保持 `open`，直到相应独立适配/修复任务完成，保存可核实的回归结果并经人工审核，再记录状态变化。**不因为静态检查部分通过就自动销案。** 修正期间 AEL 可持续复检并追加 `migration_reviews` 审计事件；这份历史本身可用于回溯哪次改动修正了哪个问题。

实现：`scripts/ael_findings.py`；隔离测试：`python3 tests/ael-migration-findings.test.py`。初始历史偏差写入命令 `python3 scripts/ael_findings.py seed` 是幂等的，已于 2026-10-17 执行完成，后续不需要重复播种。禁止通过 `ael.py init` 重新设置账本基线。
