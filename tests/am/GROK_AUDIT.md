# Grok Bot 独立 AM/Git 审计入口

本文件是**操作说明**，不是新的工程原则。先阅读仓库根目录的 `AGENTS.md`、`README.md` 与 `tests/am/README.md`。

## 独立性与授权

- GPT 只负责主线；Grok Bot 在**自己的干净 Clone**审计指定 SHA，不修改、发布或推送 GPT 主线。审计报告由 Grok 另行提交给 GPT 核查。
- GitHub Deploy Key 可以设为单仓库 `read_only=true`；凭据只能部署在 Grok 自己的环境，**不准提交到 Git 或附在审计报告中**。
- 审计 Clone、Git HEAD、Python/Node/Playwright 版本及操作系统，都必须在报告中记录。Linux 和 macOS 不等效，Linux 浏览器通过 `audit-browser-preload.mjs` 使用本机 Playwright 浏览器，但 Mac 原生截图/交互差异仍需单独验收。
- PDF 测试夹具不在 Git 中；必须通过受控渠道取得 `buffetts-alpha.original.pdf`，放到 `.v6/workspace/`；SHA-256 固定为 `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`。不下载、复制或写入 GPT 正式工作母文档。跟踪的 Markdown 测试夹具由仓库自带。

## 最简运行

```sh
git clone --branch build/2026-10-20 git@github.com:laity2010/ocr2md.git ocr2md-v6-audit
cd ocr2md-v6-audit
git checkout --detach <GPT 指定的完整 SHA>
mkdir -p .v6/workspace
# 从可信受控交付包复制只读原始 PDF 到 .v6/workspace/buffetts-alpha.original.pdf
# Linux 需要先用 npm lockfile 版本的 Playwright 安装 chromium / webkit 及系统库
bash tests/am/run-grok-audit.sh <同一完整 SHA>
```

仅当 `run-all` 实际执行、`certify` 成功，才能报告「全部已登记 AM 契约通过」。这些是集成契约关联，**不表示每个 API 都有独立黄金用例，也不保证没有未登记调用**。失败需附日志、复现步骤和环境信息；不能跳过失败脚本后假报通过。私有审计报告可以通过用户授权的独立渠道提交，Grok 不需要代码写权限。
