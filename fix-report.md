# 修复说明 · fix/grok-75e05598（基于 75e05598）

| 提交 | 内容 | 对应问题 |
|---|---|---|
| 719b591 | X-TEXTBLOCK-L48 调用方改为 C/cm-document.js（f7c5fbc 迁移所致）；L49 needle 改为 workspace.js:404 的真实调用；G28 符号改为真实存在的 internal setReview，X-WP4-G28 改走已导出的 G25 工厂；P17/P19 fixture 指向内含数据的测试脚本；C63 改归 L（与所在文件一致），X-SUBBLOCK-C63 改为 C→L；ownership 登记 10 个文件（cmd-text-blocks/joins/continuations、text-block-preview-coverage→L，cmd-pdf-text-insert→C，4 个 pdf-*→P，text-block-module→G），mineru-anchors 共享消费者增加 L，补充已登记边的 crossModuleBindings | P0-1, P0-2 |
| 719b591（代码） | 撤销违规越界，不是补白名单：删除未使用的 readCMDBlockJoins 导入（9a9bbdb）；precedingPageBlock（93c363d）改为经已登记的 L56 projectCMDLogicalTextBlocks 返回 joinable 集合，语义不变；WCP 事务中的 inspectCMDTextBlocks（9a9bbdb/b301867）改为调用 cmd.inspectTextBlocks，统一经 cm-document 的 L48 边 | P0-2 |
| b86415e | P16/L61 绑定到现有 pdf-text-extract-insert 浏览器测试，并如实标为 integration；E14/PUB-W15/SUB-W19 绑定到直接断言事件载荷和订阅效果的 chapter-live-navigation 测试（direct）；新增 tests/am/test_binding_registry.py | P1-1 |

## 撤销评估
没有整体 revert 9a9bbdb、93c363d、b301867：这三个提交之后还叠加了大量功能提交，整体撤销不安全。改为最小代码撤销，只去掉越界的导入和调用，保留功能。

## 新测试的变异检查（evidence/mutation-check.txt）
- 删除 X-JOIN-L56 边 → 测试 FAIL；恢复 → OK。
- 内置用例：向白名单注入 precedingPageBlock 会被拒绝。
- 第二个变异（G28 边回退）的 sed 同时命中了 2 行，测试报 2 个 error，不是干净的变异，不作为证据。

## 回归
- 预检 719b591：am.py build 通过，unittest 因 P1-1 失败，于是追加了 b86415e。
- 全量门禁 b86415e ×2：均 FAIL。run1 为 278/345 用例 PASS，run2 为 265/345；两次 static_findings 都是 0，direct API 都是 65/245。
- 对照实验见 report.md P1-2。

## 未修复（保持 FAIL）
- P1-2 / P1-3 业务套件失败：根因未定位，不属于可以安全修复的范围。
- P2-1 / P2-2 / P2-3 未处理。
