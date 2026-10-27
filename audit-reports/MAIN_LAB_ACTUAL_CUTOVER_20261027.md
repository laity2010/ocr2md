# OCR2MD V6 · Lab 合并后 Main 仍显示旧导航：正式功能接线修复（2026-10-27）

## 用户报告、根因与责任
用户看到生产 Main `main-261027-1947` 虽然已按 Git 正常合并 Lab，却仍是原生「章节定界 / 媒体 / LaTeX / 全局设置」下拉和导出章节按钮。**用户反馈正确。** Git 合并包含代码文件，但 Main 默认 `vite.config.mjs` 未配置 `V6_LAB_ID`，因此 `scripts/v6_lab_profile.mjs` 从不替换 `ui/main.js`, `ui/workspace.js` 的模块路径，仍然加载旧 UI。此前将「Git 合并成功」误说为「Main 功能已完成并可使用」是集成验收缺失。

## 真正的主线修复

1. 源码层 `fd4f612` 做最低限度的真实入口验证：把 Main import 指向已合并 Lab adapters，默认 `V6_LAB_ID` **未设置**的生产构建成功。隔离生产服务 Chrome+iPad WebKit 真点击通过，但 AM 所有权 scanner 检测 `OUTSIDE_UI_JS_IMPORT`，因此**未发布这个不合规临时版本**。
2. 改用 Main 自己的模块域：从已冻结 Lab 分支中的稳定源文件复制/改写 19 个相互依赖的 JS/CSS 文件到 `ui/wcp-*.js/.css`，改为 Main 内部显式依赖。正式入口依赖 `wcp-wcp-virtual-chapters.js`、`wcp-cm-document.js`、`wcp-settings-module.js`、`wcp-chapter-outline.js`、`wcp-chapter-files.js` 等。Lab 本身及其冻结分支不改；默认生产构建**完全不通过** `V6_LAB_ID` 做功能替换，也不直接从 `labs/cm-html` 导入业务模块。
3. AM `ownership.json` 登记新增 ui owned modules、shared 接口消费者、真实跨模块符号；`registry.sql` 补充 10 个源码核对过的 WCP 只读跨模块 access edges；原跨模块政策同步到真实导入。作为新源码范围，AM python baseline 改为 ui JS 48 / 9 模块 / 29 跨模块依赖。原有扫描器未放松。
4. 保留唯一 CMD 写入口、CM6 editor、AG 业务 grid、PDF.js、Markdown 和保存 ETag/If-Match 412 保护；生产没有采用 Lab 的自动刷新放宽逻辑。此次静态审计**并不能替代** Grok/Muse 对跨域扫描聚合器（`wcp-document-index.js` 复用 G/C/T/A 的公共纯读取扫描器）的独立模块边界审阅。

## 浏览器实际验证与数据保护

- `python3 tests/am/audit_boundaries.py`: `AM_WP2_PASS`。
- `python3 tests/am/am.py build && python3 tests/am/am.py check`: **PASS**，9 模块 / 122 API / 167 测试登记，48 ui JS，29 真实跨模块调用。
- `python3 -m unittest discover -s tests/am -p 'test_*.py'`: 25 中 24 PASS，1 条平台特定 SKIP。
- `npm run build`: 默认 Main 模式构建成功，未设置 `V6_LAB_ID`。
- 新 `tests/main-promoted-lab-ui.browser.test.mjs`: 在与真实 Main 完全同样的 `/` 生产静态入口运行独立 Python V6 Server、临时 Markdown/settings、无保存授权。Chrome+iPad WebKit 均实测：原始 fixture 虚拟章节 21 项，用户当前母 Markdown 的**只读副本**虚拟章节 **6 项**，实际选章改变 URL `?view=`，AG 下拉切换媒体成功；从章节导航真实点击「全局设置」后 Settings 与隐藏 Main 导航的唯一选中值均为 `settings`，pageerrors=[]，POST/PUT API writes=[]，测试副本前后字节不变。
- 截图证据 `audit-reports/screenshots/main-promoted-Chrome-new-navigation.png` 和 `main-promoted-iPad-WebKit-new-navigation.png` 来自隔离生产构建（真实用户数据副本），不是旧版 Lab 构建或示意图。
- Main 数据 SHA256：母 Markdown `c998da7aeea5410f1d7be10975c05e59efb5cdf6bfcf750595b27a048c5e3e19`，设置 `18fdc687751150f8f0c994c9889b36caf326c8e1482ddacededc6362e5c07c23`，Lab 文档 `649c0de9ce82896ef2c7a04f4fea0cc79ade32d0657cc3ebc47cc9d9864ebe6f`。

## 交付边界

这次修复针对 **Main 默认功能入口真实启用**，不是把 `V6_LAB_ID=cm-html` 实验构建伪装成正式主线。要求发布后的内外网加载截图/AG 操作再次通过，记录实际 release SHA。外部审计快照 `9953137` 仍冻结；本轮新 Main 代码须归入后续增量审计，不能冒称已获 Grok/Muse 签字。

## 实际 Main 内外网已发布（最终结果）

- **正式 Main 产物 `v6-20261027-202307`，页面标牌 `main-261027-2023`，源提交 `3321bd99a094103d8bbab5d198fa504e9a858f5c`。** 标准 `npm run build`、标准单正式目录锁定发布 `python3 scripts/v6_publish.py` 均完成；内网 `https://192.168.1.10:4443/release-version.json` 与公网 `https://ocr2md.laity.bid/release-version.json` 返回完全相同版本。
- **真实正式入口验收**（不是隔离测试、也不是 Lab URL）：Playwright LAN Chrome、LAN iPad WebKit、PUBLIC Chrome 三次实测均 `MAIN_LIVE_PROMOTED_UI_PASS`。三个环境都加载当前用户母文档，看到六个真实 CMD 虚拟章节 `000–005`；`#module-select` 旧原生控件不可见、Tom Select 文件导航+元素导航+预览导航出现、「全部」可见；实际切换 `001` 更新 URL `?view=mineru...` 和源下拉选择值。三次 `pageerror=[]`，`apiWrites=[]`。原始截图位于 `.v6/evidence/main-live-...`，可比对的导航裁图已提交 `audit-reports/screenshots/main-live-...-new-nav.png`。
- **实际内容未覆盖**：Main Markdown `.v6/workspace/buffetts-alpha.minerujson.md` SHA256 `c998da7aeea5410f1d7be10975c05e59efb5cdf6bfcf750595b27a048c5e3e19`、全局设置 `.v6/settings.json` SHA256 `18fdc687751150f8f0c994c9889b36caf326c8e1482ddacededc6362e5c07c23`、Lab 母 Markdown `649c0de9ce82896ef2c7a04f4fea0cc79ade32d0657cc3ebc47cc9d9864ebe6f` 均在修复/发布前后不变；实验分支冻结不动。正式 GitHub origin 没有推送未经完整审计的改动。
- **审计边界**：以上证明 Main 功能已真实接线并部署、核心导航对照可用，**不等于 Grok/Muse 已对这轮迁移完成独立 AM/Git 签字**。外部冻结快照 A `9953137` 未变；迁移与媒体闪烁修复属于后续 Main 差异，须作为审计补充。
