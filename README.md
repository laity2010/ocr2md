# OCR2MD V6（从零开始）

这是独立于 V5 的**全新空白源码仓库**。不继承 V5 代码、页面、服务或发布入口。首个独立验证组件是 `packages/minerujson-md/`，负责 MinerU JSON ↔ 标准 Markdown（含 HTML 注释）转换；不提供用户界面。

## 每日流程

1. 每次编译/构建都通过以下命令，`--change` 和 `--purpose` 缺一不可。构建失败也保存 Git 检查点：

   ```bash
   python3 scripts/v6_git.py build --change "修改章节按钮" --purpose "使章节操作可用" --artifact dist -- npm run build
   ```

   V6 现已提供 `npm run build`（WP1 CM6 浏览器验证）。上面的构建指令中的改动说明仍是示例。
2. 故障先选已验收构建：`python3 scripts/v6_git.py rollback --to v6-构建ID`。运行入口后续应指向 `.v6/current`；当前尚未接入服务器，命令目前只切换本地构建产物指针。
3. 需要查看旧源码：`python3 scripts/v6_git.py recover-source --build-id v6-构建ID`，会在 `.v6/recovery/` 生成独立 worktree，不修改现有源码。
4. 日终先看提交和文件差异：`python3 scripts/v6_git.py review`。用户审查批准后执行：`python3 scripts/v6_git.py review --approved --summary "今日开发成果"`；会把当天小提交汇成 `v6` 分支的一个提交，同时保留本地细历史分支。
5. **另经明确批准**后手动执行 `git push origin v6`。未明确批准不可推送。
6. 次日：`python3 scripts/v6_git.py next-day`，基于已审查的 `v6` 新建当日开发分支。

Git 能回溯文件改动和差异，但目的需要写在 commit message，编译结果及产物需要另存。每日审查不能由构建脚本擅自代替人工批准。

## WP0 转换组件

唯一组件位于 `packages/minerujson-md/`，三项公开 API 为 `toMarkdown()`、`toMineruJSON()`、`version()`。首次转换的 Buffett’s Alpha 样本、格式限制和自动验收说明见 [组件 README](./packages/minerujson-md/README.md)。

## WP1 · CM6 单窗浏览器验证

仅以 `codemirror`、`@codemirror/lang-markdown`、`@codemirror/language` 的公开 API 管理单一编辑器。Dockview/Zustand 将分别在后续验证，不在 WP1 引入。

```bash
npm ci
npm run dev                  # Mac 本机 http://127.0.0.1:5196/
npm run build                # 生产静态前端产物，由固定A/B槽发布
```

`ui/` 为唯一浏览器界面。`vite.config.mjs` 的 `/api/document` 仅实现一个固定路径的 GET/PUT 文件 I/O；默认首次从 WP0 的只读测试样本加载，第一次保存写到 `.v6/workspace/buffetts-alpha.minerujson.md`，后续打开该工作文件；不改写原样本，也不在服务端维护额外 MD 状态。实际界面直接从 `view.state.doc` 读取全文保存，保存后不重建 `EditorView`。

UI 原生 API 验收使用独立文件及端口，以免污染用户工作文档：

```bash
V6_DOCUMENT_PATH="$PWD/.v6/tests/wp1-document-test.md" npm run dev -- --port 5198
# 另一个 shell
npm run test:ui
```

测试覆盖读取真实 314KB Markdown、撤销/重做、Syntax Tree 全文元素计数、磁盘保存、滚动与选区保持、刷新还原，截图位于 `.v6/evidence/wp1/`（不进 Git）。命令要求本机已安装 Chrome。WP1 的 CM6 源码仍仅负责编辑；正式对外发布现已由下文的 V6 最小发布服务独立承担。

## V6 正式公网发布（2026-10-20）

沿用 `https://ocr2md.laity.bid/` 和既有共享应用 Cloudflare Tunnel；Agent Link 拥有唯一的网络路由配置。现行路由指向本机 `127.0.0.1:4396`（V6），原 V5 `127.0.0.1:4385` 保留供立即回退。

- `scripts/v6_serve.py`：macOS LaunchAgent `bid.laity.ocr2md-v6-server`，仅服务已构建的静态资源及 `/api/document` 读/保存。未授权写入返回 403。
- `scripts/v6_publish.py`：两个固定 A/B 槽位，构建成功后写到非活动槽，再原子切换 `.v6/current`。可用 `python3 scripts/v6_publish.py A` 或 `B` 即时退回上个已验收静态构建。
- 所有机密、工作 MD、运行槽、证据和路由备份仅存 Git 忽略的 `.v6/`。公开网页能读取示例 MD；写入需经过私有链接 `/access/<token>` 设置安全 Cookie（token 位于 `.v6/private/editor-token`，**禁止提交**）。正式服务从不启动 Vite dev 作为发布源。
- 构建继续经 `python3 scripts/v6_git.py build --change "..." --purpose "..." -- npm run build`，每次生成本地 Git 提交；之后 `python3 scripts/v6_publish.py`。无需 GitHub push。
- 如果新静态版本故障：先用 `scripts/v6_publish.py A|B` 切回保留槽；若源码需要复原，用 Git 已记录的构建提交独立恢复。若 V6 整个服务故障：在 Agent Link 网络仓库里**只把** `ocr2md.laity.bid` ingress 从 `4396` 改回 `4385`（同时把注册表 OCR2MD 诊断 URL 恢复旧值），验证配置并仅重启共享 application-main 隧道；备份在 `.v6/rollback/`，不影响其他业务。

## V6 发布后浏览器自动更新

Vite 每次编译生成唯一 `v6-YYYYMMDD-HHMMSS` 标牌和 `release-version.json`，活动 A/B 槽的 `/healthz` 直接提供相同的 `version`。已载入新版的浏览器以 5 秒间隔检查构建变化；切回前台时也立即检查。没有未保存修改则自动刷新；有未保存修改、保存请求正在进行或授权对话框未关闭时不会中断编辑，成功保存后才自动刷新。临时网络故障不触发刷新。测试命令：隔离服务运行在 4397 时执行 `node tests/auto-refresh-browser.test.mjs`。

**以前已经打开的旧版页面未包含自动更新代码，需要首次手动刷新一次以启用后续自动更新**；后续切换 A/B 无需手动刷新。此机制只检测发布版本，不新增 Markdown 副本或后台状态管理。
