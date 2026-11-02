# WCP26 WP2 · viewStore 订阅反向审计及修复

2026-11-02，整合 HEAD `51d4b258c47838ffaeed967ebc116f78eb9df4ca` 开始标准 AM/Git 全量隔离审计：哈希、端口预检、两浏览器预检、Vite、AM check 均通过；前五套业务测试 PASS，运行第六套时为补齐本文列出的正式 AM 订阅登记缺口主动中止。本轮是 **INCOMPLETE / INTERRUPTED**，不得宣称 91/91 或正式 certification PASS；原始日志在 `.v6/audit-reports/wp2-standard-51d4b25/console.log`。

## 发现

标准审计列出 `ui/*.js` 中 62 个共享状态及 DOM 候选调用点。源码检查发现 13 个文件调用 `viewStore.subscribe(`，但 AM 订阅登记表的已登记 Zustand 消费者仅覆盖其中 9 个文件；遗漏：

- `ui/html-elements-module.js`: E01 `documentRevision` 和 E03 `focusTarget`。
- `ui/note-pair-module.js`: E01 和 E03。
- `ui/sentence-module.js`: E03。
- `ui/text-block-module.js`: E03。

上述四个文件已有真实消费者，E01/E03 为既有正式共享消息；新增 SUB18–SUB23 仅登记实际读取行为，不授权访问私有跨模块对象，不改变生产代码。两个 AG 子模块 `sentence` / `text-block` 继续归属正式模块 G；不偷偷增设新的业务模块 ID。

## 修复和验证

- `tests/am/registry.sql`: 6 条 SUB18–SUB23 + 6 条 `integration` 等级的关联测试引用，明确不冒充单独直调 API 测试。
- `tests/am/test_live_view_store_subscriptions.py`: 反向检查实际 `viewStore.subscribe` 文件与所有已登记 Zustand 订阅文件集合完全一致；以及共享 store 直接 `setState` 只在 `ui/view-store.js` 内，并检查每条已登记订阅具有测试关联。该检查不是动态调用穷举证明。
- `tests/am/test_am.py`: 将 E03 订阅 ID 的旧精确断言由 6 个更新为 **原 6 + 已发现 4 个**的精确集合，不改成宽松下界；保留既有 5 个 publisher 模块断言。
- `python3 tests/am/am.py build`: PASS，12 模块 / 244 API / 14 消息 / 20 发布 / **36 订阅 / 351 契约**。
- `python3 tests/am/am.py check`、`coverage`: PASS；`python3 -m unittest discover -s tests/am -p 'test_*.py'`: 43 tests OK，1 skipped。

## 仍需审计

62 处候选调用点按当前静态范围归类：53 处共享状态读取/订阅、5 处由共享模块持有的写入、2 处 Shell DOM 查询、1 处按需字体检查、1 处 `import.meta.env.DEV` 调试入口。无此范围内明确的非所有者 `viewStore.setState`，**但不能由静态扫描否认动态/间接越界**；未覆盖的运行时路径和独立 Linux 审计仍需明确验收。

下一正式审计必须在本修复提交之后的**唯一完整 SHA** 上重新跑完 91 套 / 351 契约，不能沿用 51d4b25 已中止的审计，也不能将旧 60d47b8 的 331/345 冒充新 SHA。Main 尚未晋升与部署。
