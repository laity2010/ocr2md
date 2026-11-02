# OCR2MD WCP26 · 非法断行真实重扫的导航/环境诊断（2026-11-02）

## 来源与不可擦除的原始失败

冻结审计源 SHA `cc84b6d4d5f1a8265638293406bbabb3ac512b65`；完整 AM/Git runner 位于独立的 `ocr2md-am-cc84b6d4-isolated` 工作树，仍在运行。第 26/91 套 `tests/illegal-break-rescan-real.browser.test.mjs` 为 **FAIL**，不能用任何局部 PASS 覆盖。

审计日志：`../ocr2md-am-cc84b6d4-isolated/.v6/tests/am-full-20261102T010009Z-cc84b6d4-26-illegal-break-rescan-real.browser.test.log`。

超时 55 秒，Chrome `mode=chapter-boundary`、`agRows=0`、`cmdTags=1`、`dispatchedWorkerScans=0`，原页面内安装的 `window.__moduleTransitions` 在超时观测时未出现。和同 SHA 上一轮的相似失败一致，**怀疑页面重载/重置**，但未记录实际 navigation event 或其触发器，故目前不得判定 Vite HMR、权限、脚本切换或产品行为中的任何一项是已证明根因。

## 不减弱断言的增强诊断

测试脚本仅增设观测，不修改扫描引擎、CMD/AG 实现、授权、原断言或 55 秒门限：

- 通过 `page.on('framenavigated')` 追踪主页面导航；通过 sessionStorage 跨本页的同源加载计数区分页面刷新与模块内切换。
- 捕捉 Vite 的 console 更新提示以及真实 WebSocket `framereceived` 中的 `full-reload/update/prune/error` HMR 消息；非 Vite 数据不计入。
- 若原有断言超时，附带记录页面 URL、导航类型、刷新计数、模块切换追踪、页面导航记录、HMR 帧和 Worker postMessage 次数。**只输出观察证据，不更改 FAIL 判定。**

## 同环境对照

使用与冻结标准 runner 相同的 Chromium/WebKit 浏览器预加载器、真实 Buffett MD/PDF 证据、独立临时文档、原有写入/保存/重开断言：

| 环境和诊断级别 | Chrome | iPad WebKit | 说明 |
|---|---|---|---|
| Vite dev，导航追踪，连续三轮 | 3/3 PASS | 3/3 PASS | 每轮实际重扫、生成两个 CMD 标记、保存与重开；导航仅见脚本明确请求的重开 |
| 正式 Python server，导航追踪 | PASS | PASS | 生产服务入口与真实授权 Cookie，同样完成真实保存与重开 |
| Vite dev，新增 HMR WebSocket 监听第一轮 | PASS | FAIL | WebKit 重扫/保存/重开均完成，但 `/127.0.0.1:5978/healthz due to access control checks.` 进入 `pageerror`；原有“无浏览器错误”断言如实失败；未捕捉到可判定的 HMR full-reload 帧 |
| Vite dev，HMR 监听第二轮 | PASS | PASS | 真实两个标记、保存、重开，未出现 HMR full-reload 消息；Vite 核心仍存在需要复现的偶发错误 |

实际文本记录保存在整合树的 `.v6/audit-reports/wp2-reload-diagnostic/`，为审计诊断性忽略目录，不属于用户工作数据，不用作正式认证。

## 裁决和门禁

- 当前**未能复现**冻结完整跑批的 Chrome 重扫回退；不能凭局部 PASS 推断修复。
- WebKit `/healthz` 报错必须原样保留。即使重扫动作完成，完整浏览器错误门禁失败仍是 FAIL，不得靠过滤 errors 合格。
- 生产模块源码未改，也没有使用固定 sleep、上调超时、减少断言或白名单隐藏错误。
- 后续需等待冻结 `cc84b6d` 的 91 套全量结果，结合第 53 套 PDF 三击和第 85 套双框概览，确认所有待修复问题后，再以新 SHA 进行真实全量复审。独立 Linux、动态调用点审计继续保留未认证状态。
