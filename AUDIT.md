# OCR2MD V6 · 公开 AM/Git 独立审计交付包

本分支是供 Grok / Muse 匿名获取的审计包，不是正式开发 Main 或生产发布。本轮公开此冻结快照及已公开过的测试夹具，已经用户于 2026-10-27 明确授权。普通开发/正式发布仍遵守 AGENTS.md。

| 项目 | 固定值 |
| --- | --- |
| 仓库 | https://github.com/laity2010/ocr2md |
| 公共审计分支 | audit-public-06bf498 |
| 被审源码完整 SHA | 06bf498daab22ad175f5ae4727a2c1e66b38402c |
| 标准 PDF 测试夹具 | .v6/workspace/buffetts-alpha.original.pdf |
| PDF SHA-256 | be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab |
| MD SHA-256 | d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764 |

## 从零开始（Mac / Linux 通用）

~~~bash
git clone --single-branch --branch audit-public-06bf498 \
  https://github.com/laity2010/ocr2md.git ocr2md-audit-06bf498
cd ocr2md-audit-06bf498
bash audit.sh
~~~

audit.sh 检查 Git 及 PDF/MD 哈希，在兄弟隔离 worktree 检出准确的被审 SHA，并将只读 PDF 副本放入隔离工作区，调用冻结源码中的统一脚本 tests/am/run-grok-audit.sh。这是 AM/Git、Chrome/WebKit 的实测入口，而非运行审计包 HEAD 的业务代码。要求 Git、Python3、Node >=22.13、npm 及所需真实浏览器/系统库。缺环境时报告 BLOCKED，不改测试或冒充通过。

**区别：审计包分支 HEAD 包含交付材料，不等于被审源码 SHA。** 具体受审提交永远固定为 06bf498daab22ad175f5ae4727a2c1e66b38402c。

## 两位 AI 的独立审计与自主修复

Grok、Muse 各自在真实执行环境从以上公开 GitHub 匿名克隆源码、独立运行 AM/Git 和必要的业务及跨平台专项审查，检查 WCP/AM 模块边界、设置、媒体、LaTeX、虚拟章节、PDF 交互、412/CAS 草稿保护、生产/Lab 接线等。互不代跑，也不互认对方的测试为自己的 PASS。

保留原始 FAIL/BLOCKED 日志、原始审计报告及缺陷级别。自主修复必须从上述冻结 SHA 在独立修复分支开始：

- Grok：fix/grok-06bf498；报告 audit/grok-06bf498-report
- Muse：fix/muse-06bf498；报告 audit/muse-06bf498-report

审计报告明确分开 SOURCE_MERGE（可否进入开发 Main）和 PRODUCTION_CUTOVER（可否正式发布）的建议。使用各自已验证的 GitHub 写入通道提交报告和代码；匿名读取不意味着匿名推送。主管 AI 独立复核后决定是否通过普通 Git merge 吸收修复。禁止修改冻结审计源、当前 Main、Lab、生产数据，禁止强推、rebase、reset --hard、git clean。

如果测试未通过，要保留真实失败证据；如无法推送报告，则说明写入通道受阻。用户只负责转发同一份启动 Prompt，**不传 bundle、PDF、权限凭据或其他文件**。
