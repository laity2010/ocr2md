# V5 AEL · 历史差异归档与继续监控

适用范围：**V5 AEL**。不修改仓库 Git 历史、V4/V3、MOPJO，也不修改用户保留的 WIP。

## 两种记录不能混为一谈

- **历史基准差异**：在某个 AEL 任务结束后，源码又经历了独立开发和发布，但没有登记新任务。这样的差异会使 `ael.py check` / 下一次 `begin` 失败。先确认其发布与验收证据，才能通过显式归档解除阻塞。
- **历史产品/架构发现**：`migration_findings` 和 `architecture_findings` 始终独立于基准。未验收的发现继续保持 `open`；`review` 追加复核记录，不得把“已归档”当作“已修复”。

## 唯一允许的历史归档流程

先人工逐项核对 `python3 scripts/ael.py check` 的差异：权威组件源码、发布构建、非发布工具和测试。确认没有正在执行的 AEL 任务，没有未知来源变化。

```bash
cd ui-spikes/v5-directory
python3 scripts/ael.py reconcile-plan \
  --out .runtime/historical-plan.json \
  --reason "明确说明为什么当前历史变更已经核实" \
  --evidence "写出构建号、真实测试和差异证据"
```

读取 `.runtime/historical-plan.json`，逐行审核路径、AEL 所有者、旧 SHA256、新 SHA256、是否与当前部署字节相等。接受以后，将计划内完整的 `planDigest` 作为确认参数：

```bash
python3 scripts/ael.py reconcile-apply \
  --plan .runtime/historical-plan.json \
  --confirm "<完整 planDigest>"
python3 scripts/ael.py check
```

归档过程会：

1. 重新计算全部源码及外部 Shared Settings 源码 SHA；文件有任何变化就拒绝过期计划。
2. 比较计划哈希、前后基准哈希、发布构建及文件来源，不接受计划被篡改。
3. 在 `.runtime/ael-backups/` **备份完整 SQLite 数据库**。
4. 在 `historical_reconciliations` 追加不可覆写的一条补登记录，保存逐文件哈希、理由及证据，再更新唯一当前检查基准。
5. **不修改**已经结束的 `changes(id>0)` 任务和任何 `migration_findings` / `architecture_findings` 状态。

新的目录、源码、测试、Shared Settings 源码变化仍会被 `check` 发现；非本模块修改仍由 `finish` 的所有权规则处理；没有通过测试的任务无法以 `passed` 结束。

## 日常开发

```bash
python3 scripts/ael.py check
python3 scripts/ael.py begin --module workspace --category fix --task "具体修改目的"
python3 scripts/ael.py test --name smoke -- <真实测试命令>
python3 scripts/ael.py finish --result passed
python3 scripts/ael.py review
```

`reconcile-apply` **不是日常修复命令**，不得用于绕过当前任务的边界违规或失败测试。历史归档后若再有未登记变化，应先查出是哪轮开发造成的，不要重复无条件归档。

独立回归：`python3 tests/ael-reconciliation.test.py`（仅临时目录，测试伪造计划、过期计划、备份、日志保留、新变更检测和正常任务生命周期）。

