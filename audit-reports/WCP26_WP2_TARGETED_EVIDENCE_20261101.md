# OCR2MD V6 · 三方审计集成 WP2 实测证据（2026-11-01）

## 范围与不可越权的结论

- 冻结 Main 为 `75e055988df73d3d3899036f6a62ce1e851f2d15`，工作区 `fix/audit-integrated-75e05598`。
- Grok 修复逐个普通 cherry-pick；Muse 登记补丁作为反证参考，未混合覆盖。移除无实际门面的 G28（原审阅闭包 `setReview`），三条原测试用例保留并真实挂靠 G25/G26。
- AG 启动模块恢复章节定界、PDF 真实调用边界修正、独立文本块样本、三击接续迁移和 CAS 直接 HTTP 回归已保留。窄 PDF 分栏工具栏以容器宽度紧凑化；页面编号、缩放及「字/标」两个操作入口保持可用。
- 仅记录本机执行；**没有完整 91 套 AM/Git 认证、没有 Linux 同 SHA 复验、没有真实 iPad Safari 验证**，不得标成全量 PASS，不允许据此合并或发布 Main。

## Mac Chrome / Playwright iPad-WebKit 精确结果

| 项目 | Chrome | Playwright iPad-WebKit | 证据 |
|---|---|---|---|
| 章节导航 21→20→21、Undo/Redo、菜单镜像 | PASS | PASS | `.v6/audit-reports/integrated-focused/chapter-{chrome,webkit}.log` |
| CM6 编辑、保存、刷新、光标滚动 | PASS | 未运行此特定脚本 | `cm6-chrome.log` |
| 文本块三项基础/五项审阅、5 组候选、PDF 双框 | PASS | PASS | `text-block-{chrome,webkit}.log` |
| AG 五列表头 16px resize 命中区、触控过滤 | PASS | PASS | `ag-header-after.log` |
| PDF 原始 caption/body/note 独立文本层及标签 | PASS | PASS | `pdf-child-{chrome,webkit}-after.log` |
| PDF 拖动边缘滚动、224 原始 checkbox、Undo | PASS | PASS | `pdf-block-drag-edge-scroll.browser-after.log` |
| PDF 重排、跨栏、接续、Undo | PASS | PASS | `pdf-block-reorder.browser-after.log` |
| 分栏保留 PDF.js 实例，所有六项控件可见 | PASS | **BLOCKED**（控件测量已通过，后续点击时 WebKit 浏览器/上下文关闭） | `preview-split-after.log` |
| 共享预览 MD↔PDF、工具栏隐藏、缩放 | PASS | **BLOCKED**（WebKit 截图时上下文关闭） | `shared-preview-after.log` |
| 断行真实样本：1→2 标定、保存、刷新无重复扫描 | PASS（复跑） | PASS（复跑）；此前独立运行 FAIL | `illegal-break-rescan-real.browser-after.log`、`illegal-break-diagnostics.log` |
| CMD 224→223→224 接续/还原、源码锚点 | PASS | 逻辑单测非浏览器 | `cmd-block-joins-after.log`、`pdf-source-locations-after.log` |
| HTTP CAS 428/412/403/200/旧版本 412 | PASS | 非浏览器场景 | `document-cas-http-after.log` |

WebKit 在同机并行运行的部分测试中浏览器进程关闭：这是**可核查的失败**，但根因尚未区分资源压力与产品触发；不得靠重试当作 PASS，也不得伪报功能缺陷。

## AM 结果与遗留事项

- Python AM 单元测试：40 项，OK，1 SKIP；AM `build` 12 模块 / 244 API / 14 消息 / 20 发布 / 30 订阅 / 345 条契约，PASS；`am.py check` PASS。
- 静态模块归属：82 UI 文件、48 个跨模块 import、0 已检出的静态违规；**动态调用点 62 处仍需逐条复审**，当前不能声称全部合规。
- 断行重扫首次独立执行的 55s 超时未消除；测试已新增超时诊断，显示 Worker 投递次数、AG 行数与 CMD 当前标记数，保持原断言和超时不变。
- Grok/Muse 对三个 `cmd-*` 投影辅助文件的归属判定不同：目前保留与现有 L 系公开接口及实测边界一致的 Grok L 登记，避免在这一轮同时重编号 244 个 API 的边界；如后续要调整为 C 所有权，须独立设计、迁移契约并全量验证，不能改一个字母冒充修复。
- 尚须执行完整同 SHA 91 套、复核 Linux、真实 iPad Safari 和动态 62 处；`SOURCE_MERGE=HOLD`，`PRODUCTION_CUTOVER=NO`。
