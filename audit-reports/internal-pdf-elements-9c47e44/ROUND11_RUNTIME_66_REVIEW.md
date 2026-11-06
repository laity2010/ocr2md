# OCR2MD R11 · 动态边界候选 66 处第一层审阅

审阅对象：**固定源码 `c7b9f65ee9e4aa6487ebefc6d7e7bb672970da79`**。原始三方冻结审计 SHA `9c47e44f1fc6b44b4f126030d68008854aced6ca` 不变。审阅范围为仓库 `tests/am/standard_audit.py` 同一 `RUNTIME_SURFACES` 正则检出的 `ui/*.js` 调用点。逐处文件、行号、所有权及表达式位于配套 `ROUND11_RUNTIME_66_TRIAGE.tsv`（67 行含表头，66 处）。

## 清单与所有权验证

| 分类 | 数量 | 判别、定位与初步结论 |
|---|---:|---|
| Shared `viewStore.getState`/`subscribe` 读取及订阅 | **54** | 消费者包括 Shell、AG、Media、LaTeX、Note、Preview、Scroll 等。按 `tests/am/ownership.json` 的 `files` 实际模块所有权及 `sharedConsumers["view-store.js"]` 校验，**54/54 均在已登记的共享基础设施消费范围**。没有在这些调用行发现跨模块 `viewStore.setState`。 |
| `ui/view-store.js` 维护自身 Store | **8** | 内部 `setState`/`getState` 的发布与只读判定；归属 shared Store 自身，状态模型不存 Markdown 原文。 |
| Shell 直接访问 DOM | **3** | `ui/main.js:36` 使用 `getElementById` 作为顶层装配入口；`ui/main.js:129` 检查打开的原生对话框以禁止非开发版页面误刷新；`ui/fontcheck.js:21` 在显式 `?fontcheck` 诊断入口读取 CM6 DOM 字体度量，诊断只创建自身短暂测量 span 和独立只读面板。均在 Shell 所有权内，未在这里直接修改其他业务模块的持久化状态。 |
| 仅开发模式暴露的调试对象 | **1** | `ui/main.js:1190`：`if (import.meta.env.DEV) window.__v6cm6 = ...`；生产 `npm run build` 的 JS 产物中未找到该全局字符串。**风险点**：开发入口对浏览器脚本暴露 EditorView / PDF 调试对象；受开发环境隔离限制，绝不能认为 dev URL 可任意暴露给不可信内容。 |

自动分组复核合计 **54+8+3+1=66**。在同一 66 点词法扫描范围中，`UNREGISTERED_SHARED_CONSUMER=0`、`DIRECT_STORE_WRITE_OUTSIDE_OWNER=0`、`CROSS_MODULE_DOM=0`、`UNGUARDED_GLOBAL=0`；扫描规则是既有审计定义而非新增白名单。

## 对事件注册及语义的审查

`view-store.js` 公开 `documentChanged`、`selectionChanged`、`publishFocus`、`publishScroll`、`setScrollSyncEnabled` 等单一 Shared Store 消息发布入口；`tests/am/registry.sql` 包含 E01–E07 Zustand 字段消息，以及 E08 DOM 章节错误消息与对应发布/订阅登记。AG、HTML、LaTeX、Media、Note 订阅方按 `documentRevision` 避免对未编辑文档重刷；PDF 和 Scroll 订阅方按 `origin`、`intent`、`revision` 防止焦点回环。按已登记 ownership 和源接口检查，与单一 CM6 Markdown 主存储原则相符。

字面量 CustomEvent 的 `ocr2md:...`、`settings.changed` 由标准脚本分别收集；本轮执行的 AM 静态检查报告 **0 个未登记事件位置**，不代表运行时所有动态派发事件均已经验证。

## 暂时不能判定 PASS 的边界

1. **本报告是 66 处词法清单的所有权分类及代码审阅，不是全部 66 路真实事件已实际触发**。未检查经别名/对象属性计算/间接引用/动态 DOM 访问的全部可能调用点。需独立 Grok/Muse 或隔离浏览器事件轨迹验证每条关键消息的生产调用链，尤其焦点竞态。
2. **无直接 API 测试的风险仍在**：现有登记了 311 APIs / 452 个脚本关联；关联不等于 311 个真实独立 API 测试通过，具体必须以标准 `report.json` 的 `api_directly_tested`、`api_without_direct_test` 为准。
3. R10 的 WebKit `p4b0s0` 子块定位曾在状态检查里出现旧 `p3b0s1` 文案；R11 在严格条件下连续 6 轮 Chromium 与 WebKit PASS，但没有主动构造能重现旧竞态的并发事件顺序，仍列 **OPEN 风险 / 复现待定**。不能由 6 次绿灯推出事件顺序安全的完整证明。
4. Linux 真实运行及物理 iPad Safari 手势验收不在本地 Mac 浏览器自动化覆盖内。
5. 只有同 SHA 完整 143 套标准 AM/Git、动态消息边界与独立审计签字均满足，才可以宣布**完整审计通过**。本报告无权放行 Main 合并、部署或外审替代。

**阶段判定：66/66 候选已完成源码归属初筛；0 个已确认违规，真实性/穷举性的最终判定是 `REVIEW_REQUIRED`，而不是 `PASS`。**

## 证据指纹

- `ROUND11_RUNTIME_66_TRIAGE.tsv`：SHA256 `9db50eaf5a0777acdb0b6e0f90faf3426cbb5747fd42b9c60356ec06ead57266`。
- 来源：`ui/*.js`、`tests/am/ownership.json`、`tests/am/registry.sql`、`tests/am/standard_audit.py`，均归属同一源提交 `c7b9f65e...`，已保存 Git，不包含个人环境数据。
