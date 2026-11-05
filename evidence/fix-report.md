# Grok PDF 元素审计修复报告

## 固定对象与候选分支

- 固定受审源码：`9c47e44f1fc6b44b4f126030d68008854aced6ca`。
- 审计交付包 HEAD：`a1c9c57f887523084b8eafe5b2f5568902826bc2`。
- 修复分支：`fix/grok-pdf-elements-9c47e44`。
- 本轮冻结修复 HEAD：`a58efa90e2f2ed0a785d6220c1a7d56a8cc7cd8c`。
- 所有修复均为普通 commit/push，未改写已推送历史；未修改冻结 PDF、Markdown 或 MinerU JSON fixture。

## 提交与实际修复范围

1. `2ee865729b716e613a64f104a702c778ca3889b1`：修复 AM registry 的合法 visibility、真实调用位置、外键和 UI ownership；使原本在 SQLite CHECK 处终止的门禁可以执行真实业务测试。未放宽 AM schema。
2. `988f5484e49b391fc4066b18bc755b1cf64ed3d2`：sealed JSON 校验及 legacy PBS inventory。后续 AM 检查证明其中的 Node-only browser import 是本轮引入的回归，未作为已解决项隐瞒。
3. `e7f918f2899d41c07fca1836bdad99a301484118`：以浏览器原生 `DecompressionStream` / `crypto.subtle` 的共享 sealed reader 消除该回归；保留原生子块 provenance，并验证 promote、absorb/reparent/reorder、split/reattach 循环。
4. `3bebbfb1fc56e67a7e2a540fe46be949e1b2bc91`：使用 PDF.js 真实客户区分数几何、正确 rail transform 与 OCR clearance；不改原 PDF/OCR bbox。
5. `a58efa90e2f2ed0a785d6220c1a7d56a8cc7cd8c`：把 PDF 接续接回 canonical CMD BC；统一 canonical 与 legacy 的父逻辑块投影，只更新变化的 chip，保持物理 origin 和其他页面 DOM。

共修改 21 个源码/测试/AM 登记文件；完整列表可用下列命令复核：

```sh
git diff --stat 9c47e44f1fc6b44b4f126030d68008854aced6ca..a58efa90e2f2ed0a785d6220c1a7d56a8cc7cd8c
```

## 有证据的针对性结果

- converter 23/23 PASS；原始 JSON bytes 和 OCR bbox 保持不变；缺失/伪造/重复 origin 及真实重复完整 OCR atom fail closed。
- 原生结构循环、split/reattach 和 reparent probe PASS；跨页表格篡改与不匹配的 sealed archive 被拒绝。
- CMD inventory：224 parents、224 matched、0 missing/duplicates；readable=216、metadataOnly=8。
- rail 几何：224 parent covers、sameRow=224、overlap=0、collisionCount=0、offPage=[]。
- join Chrome 与 Linux Playwright iPad-WebKit 仿真均 PASS：224→223→224；跨页 `p8b8→p9b0`；其他 212 个页面 chip 的 mutation=0。
- BC 逻辑投影单元测试 PASS，且 `if(false)` 变异得到预期 `224 !== 223` FAIL；AM_CHECK/静态 boundary PASS。
- 上述均为针对性证据，不代替完整门禁，也不构成真实 macOS/iPad 设备验收。Linux WebKit 的 native-alignment probe 仍失败于 picker 不可用。

日志位于 `evidence/targeted-probes/`；包含 PASS 和 FAIL，不能只读取成功日志推断全套件状态。

## 未纳入本轮冻结修复的实验

- `pdf-block-reorder` 的横向三槽 drop 实验：纯函数通过，但 Chrome 集成继续 FAIL；后续移动报告一个缺失源码父块。该实验及其测试改动未提交。
- AG / illegal-break / WebKit picker helper 等未完成实验未提交；不能声称这些问题已修复。
- 这些 WIP 文件保留在本地修复工作树供后续排查，不属于候选 FIX_SHA，不进入报告分支。

## 修复结论

本轮消除了一批确定的 AM、sealed-reader、原生结构、rail 几何和 canonical join 根因，但完整候选仍有失败；最终计数与逐项遗留以根目录 `report.md/json` 和 `evidence/final-gate-{1,2}/` 为准。本报告不是修复者对自身改动的独立验收签字。

### 契约复核警告：接续能力的激活状态

固定源码含 `TEXT_BLOCKS_READ_ONLY=true` 且 Shell 明确把 join 接到 `rejectTextBlockEdit`，说明接续能力曾被撤下；与此同时，仓库中的完整 join 浏览器测试仍要求三击接续。`a58efa9` 验证的是“恢复该测试要求的既有 checkbox 能力”，不是对产品重新授权的证明。主线在合并前必须明确裁决该能力应恢复还是测试应随授权变更更新；本审计没有删除旧测试或自行宣布新授权。
