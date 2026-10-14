# WP0 · 保存标定首次读回误报

## 操作 / 需要 / 效果

- **初始状态**：已载入真实 224 块 DIRjson，用户在 iPad Safari 修改独立成章边界，点击一次「保存标定」。
- **旧故障**：实际后端返回 HTTP 200 并写入 `chapters-map.v1.json`，但浏览器紧接着读取到旧的侧车标定或发生 iCloud 元数据修订变化，于是显示「小标定写入后读回与提交数据不一致」。重复点击可能成功，却造成冗余 CAS/覆盖备份。
- **需要**：第一次保存若服务端已确认成功，只做最多三次短暂读回重试；要求 DIRjson generation 一致、映射语义完整一致、有效服务器修订号。重试不得发起新的 POST。
- **效果**：确认时使用读回的最新 revision 更新下次 CAS 状态、清除 dirty；一致性无法确认时保留草稿并显示「尚未完整确认」，不谎称没有执行过写入。
- **不变量**：真实书籍、PDF、OCR、DIRjson 快照不由测试改写；其他设备真正提交不同映射、错误 generation、无 revision 均不得被误判成功。加载/切换模块不受影响。

## 自动化与门禁

- `node ui-spikes/v4-directory/tests/markingsReadback.test.mjs`：模拟修订号变化、首次旧版读回、延迟可见、远端不同映射、错误代际和无修订号（六项）。全部只重试 GET。
- `node ui-spikes/v4-directory/tests/boundaryMountRecoveryBrowser.mjs`：WebKit/Chromium 实际书籍，强制挂载失败→重试→可见 AG/源码/PDF/导航，拒绝所有真实书库写入。
- `node ui-spikes/v4-directory/scripts/check-plugin-boundaries.mjs`：模块依赖边界。候选发布 `--upgrade --diagnostic` 限定单个章节定界代码包，正式版不变。
- 真机最终审核：先核实草稿已成功保存，再加载新版候选；用户修改一项独立成章勾选，单击一次保存，看到 CAS 读回一致；刷新后状态持久，原文不变。

**状态（2026-10-14）**：隔离单测 6/6、插件边界、WebKit/Chromium 工作台恢复、WP2 升级 6 项、WP3 目录可见行以及本机/公网 SHA 门禁通过。候选 `v4-261014-2310` 已发布，iPad LAN HTTPS 4443 访问该版本 HTTP 200；稳定正式版仍 `v4-261014-0816`。旧候选完整回退快照已保留。**iPad Safari 真机人工验收已通过（2026-10-14）：用户确认在 `v4-261014-2310` 多次尝试保存，均得到 CAS 读回一致，不再需要重复点击保存。** 此记录仅确认多次保存与读回；刷新后持久恢复尚未由本次用户反馈单独验证。正式版保持 `v4-261014-0816`，不自动晋升，也不启动 WP1。
