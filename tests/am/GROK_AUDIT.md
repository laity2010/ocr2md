# AM/Git 第三方审计说明（本审计包）

**请以仓库根目录 [AUDIT.md](../../AUDIT.md) 作为唯一现行启动说明**：

```bash
git clone --single-branch --branch audit-fixture-5c7497c https://github.com/laity2010/ocr2md.git ocr2md-audit-bundle
cd ocr2md-audit-bundle
bash audit.sh
```

审计包分支已明示地更新跨平台滚动测试中一条浏览器相对几何断言，其余业务源码和 AM 注册表仍与冻结基线一致；`AUDIT.md` 与 Git diff 详细列出双 SHA、修改原因和证据。

审计包分支已跟踪原始 PDF 与 `fixtures.SHA256SUMS`，无需私钥或额外 PDF 交付；但仓库**目前是公开的**。`audit.sh` 自动建立冻结 SHA 的独立工作树，校验样本，运行 AM/Git 全量测试并产生证据。

审计结果还必须由第三方 AI 检查源码里的跨模块调用和潜在未登记依赖，生成 `INDEPENDENT_AM_GIT_REPORT.md`，**AM 通过不代表架构绝对无越界**。不要改写或推送 GPT 主线。

*说明：此文件是审计包分支上的现行交接文本；冻结业务源码提交 `5c7497c` 中的历史版本不做修改。*
