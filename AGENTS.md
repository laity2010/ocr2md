# Agent 开发约定

## 产品功能与 UI 改动必须遵循功能规范 + UIC

凡是修改 `ui-spikes/integration` 的产品功能、界面、交互、导航、编辑器、数据表、保存行为或设备适配，Agent 在动代码前必须先阅读：

- `ui-spikes/integration/tests/FEATURE_PROTOCOL.md`
- `ui-spikes/integration/tests/UIC_PROTOCOL.md`

并遵守以下规则：

1. 新增或改变一个产品功能，必须新增或更新 **Feature Contract（功能规范）**，写清“操作 / 需要 / 效果”，并加入顶部“功能调试”供用户独立运行审核。
2. 新增或改变一个用户可见交互，必须新增或更新一个 **UI Interaction Contract (UIC)**。
3. UIC 必须写清：初始状态、用户动作、预期界面、数据副作用、不变量、自动化等级。
4. 能浏览器自动化的交互，不得只写人工说明；必须进入 `tests/scenarios/` 并由通用 UIC runner 执行。
5. 发现 UI bug 时，优先把复现步骤固化为 UIC 回归样例，再修 bug。
6. 禁止依赖屏幕坐标、像素位置或 AG Grid 私有 DOM class 作为主要测试手段；优先使用稳定 id、role、data-*、公开 API。
7. 涉及 Google OAuth、真实 Drive、Cloudflare Access、iPad Safari 系统手势等外部依赖时，可标记为 `manual-external`，但仍必须留下完整契约。
8. integration UI 改动完成后至少运行：

```bash
npm run test:all
```

9. 不得为了让测试通过而降低契约中的业务预期；若产品规则改变，应同时更新功能规范和 UIC 并说明原因。
10. “功能调试”不得通过 debug-only flag 才启用真实产品能力；正常产品路径必须独立可用。
11. 自动测试只是预检；功能完成后必须保留“待用户审核 / 已通过 / 退回”的人工审核状态。
12. 一个产品功能原则上只占一个“功能调试”菜单入口；复杂功能应在单入口内部以可见步骤流程完成多场景验收，自动 UIC 可以拆分，但不得机械拆成多个菜单项。

规范与目录见：

- `ui-spikes/integration/tests/FEATURE_PROTOCOL.md`
- `ui-spikes/integration/tests/FEATURE_CATALOG.md`
- `ui-spikes/integration/tests/UIC_PROTOCOL.md`
- `ui-spikes/integration/tests/CATALOG.md`
- `ui-spikes/integration/tests/scenarios/`
