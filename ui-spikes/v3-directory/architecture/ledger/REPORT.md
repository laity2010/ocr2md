# V3 架构优化数据报告

- 完结需求轮次：5
- 口径：相对 begin 时文件 SHA-256 的变化；旧 WIP 不自动计入。
- 热度表示开发期间编辑文件的轮次，**不表示运行时使用频率**。
- 并行修改可能影响归因；对此应在本轮 note 中标注。

## 模块涉及轮次

| 模块 | 轮次 |
| --- | ---: |
| media | 3 |
| infrastructure | 2 |
| shared | 1 |
| boundary | 1 |

## 共享文件热点

| 文件 | 独立轮次 | 处理建议 |
| --- | ---: | --- |
| ui-spikes/v3-directory/index.html | 2 | 继续观察 |
| ui-spikes/v2/v3-directory/sw.js | 2 | 继续观察 |
| ui-spikes/v3-directory/sw.js | 2 | 继续观察 |
| ui-spikes/v2/v3-directory/index.html | 2 | 继续观察 |
| ui-spikes/v3-directory/src/app.ts | 2 | 继续观察 |
| ui-spikes/v3-directory/src/workbench.ts | 2 | 继续观察 |
| ui-spikes/v2/v3-directory/wcp-alpha/index.html | 2 | 继续观察 |
| ui-spikes/v3-directory/wcp-alpha/index.html | 2 | 继续观察 |
| ui-spikes/v2/src/calibrationGrid.ts | 1 | 继续观察 |
| ui-spikes/v3-directory/wcp-alpha/debug-bridge.js | 1 | 继续观察 |
| ui-spikes/v3-directory/wcp-alpha/settings.schema.json | 1 | 继续观察 |
| ui-spikes/v2/v3-directory/wcp-alpha/settings.schema.json | 1 | 继续观察 |
| ui-spikes/v2/v3-directory/wcp-alpha/debug-bridge.js | 1 | 继续观察 |
| ui-spikes/v3-directory/wcp-alpha/modules/contracts.js | 1 | 继续观察 |
| ui-spikes/v2/v3-directory/wcp-alpha/modules/document.js | 1 | 继续观察 |
| ui-spikes/v2/v3-directory/wcp-alpha/modules/entry.js | 1 | 继续观察 |
| ui-spikes/v2/v3-directory/wcp-alpha/modules/review.js | 1 | 继续观察 |
| ui-spikes/v3-directory/wcp-alpha/modules/entry.js | 1 | 继续观察 |
| ui-spikes/v3-directory/wcp-alpha/modules/document.js | 1 | 继续观察 |
| ui-spikes/v3-directory/wcp-alpha/modules/media.js | 1 | 继续观察 |
| ui-spikes/v2/v3-directory/wcp-alpha/modules/media.js | 1 | 继续观察 |
| ui-spikes/v3-directory/wcp-alpha/modules/media-scan.js | 1 | 继续观察 |
| ui-spikes/v3-directory/wcp-alpha/modules/review.js | 1 | 继续观察 |
| ui-spikes/v3-directory/wcp-alpha/modules/media-scan-entry.ts | 1 | 继续观察 |
| ui-spikes/v2/v3-directory/wcp-alpha/modules/contracts.js | 1 | 继续观察 |
| ui-spikes/v2/v3-directory/wcp-alpha/modules/media-scan.js | 1 | 继续观察 |

## 测试耗时

| 用例 | 次数 | 平均秒 | 最慢秒 | 失败次数 |
| --- | ---: | ---: | ---: | ---: |
| media-progress | 1 | 158.4 | 158.4 | 0 |
| module-switch | 1 | 135.3 | 135.3 | 0 |
| media-recovery | 1 | 90.3 | 90.3 | 1 |
| media-recovery-serial | 1 | 53.0 | 53.0 | 0 |
| media-cas-recovery-chromium | 1 | 36.1 | 36.1 | 0 |
| media-cas-still-aborts | 1 | 31.0 | 31.0 | 0 |
| release-chromium-ui | 1 | 25.7 | 25.7 | 0 |
| media-resync-webkit | 1 | 21.8 | 21.8 | 1 |
| media-resync-webkit-retry | 1 | 16.0 | 16.0 | 0 |
| media-build | 1 | 8.2 | 8.2 | 0 |
| bq-release-build | 1 | 8.1 | 8.1 | 0 |
| media-order-build | 1 | 8.0 | 8.0 | 0 |
| media-build-byte-exact | 1 | 6.7 | 6.7 | 0 |
| release-build | 1 | 5.2 | 5.2 | 0 |
| media-registry | 1 | 3.5 | 3.5 | 0 |
| existing-media-unit | 1 | 3.1 | 3.1 | 0 |
| media-backend-security | 1 | 2.4 | 2.4 | 0 |
| media-core-rerun | 1 | 1.8 | 1.8 | 0 |
| media-core-final | 1 | 1.8 | 1.8 | 0 |
| release-core | 1 | 1.7 | 1.7 | 0 |
| media-core | 1 | 0.9 | 0.9 | 1 |
| alpha-publish | 2 | 0.2 | 0.3 | 0 |
| alpha-isolation | 1 | 0.2 | 0.2 | 0 |

## 判读

- 同一共享文件在至少3个独立功能轮次中反复改动，只触发评审，不自动重构。
- 测试为逐命令 wall time；并行测试不能加总当作用户等待时间。
- BP 以前手写历史基线另见 tests/CHAPTER_MODULE_HOTSPOT_LEDGER.md。
