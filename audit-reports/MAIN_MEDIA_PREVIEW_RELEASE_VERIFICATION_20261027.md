# Main 媒体 AG 预览列闪烁：内外网发布与真实浏览器验证（2026-10-27）

## 构建/发布记录

- 修复源提交：`49958be5a810277d9463c0a69a796d4d502e90b1`（仅 `ui/media-module.js` + 独立测试与审计证据）。
- `npm run build` **成功**，产物 `v6-20261027-194730`；按现有单目录、文件锁安全发布脚本 `python3 scripts/v6_publish.py` 安装到 `.v6/release`，`release.json` 记录上述源码提交。
- 内网 `https://192.168.1.10:4443/release-version.json`、公网 `https://ocr2md.laity.bid/release-version.json` **均返回** `v6-20261027-194730`。

## 发布后发现和解决的兼容问题

正式服务是 launchd `bid.laity.ocr2md-v6-server`，原 Python 进程于 10 月 25 日启动，尚运行旧的 `/api/document` GET 实现；前端已有强 ETag 检查，导致真实浏览器显示“文档响应缺少版本 ETag，拒绝开启无保护保存”。

使用正式 launchd 服务 `launchctl kickstart -k gui/<uid>/bid.laity.ocr2md-v6-server` 做受控重启，不修改授权/保存代码、不直接执行业务写入。新进程 PID 81487，`/api/document` GET 经 localhost、LAN、Cloudflare 公网返回同一强 SHA256 ETag `"c998da7aeea5410f1d7be10975c05e59efb5cdf6bfcf750595b27a048c5e3e19"`。客户端保留缺失 ETag 不加载/412 冲突保护。此处为存量服务进程与新主线代码不同步，并非媒体改动引入新保存旁路。

## 真实发布入口交互（非只看构建版本）

无写入 Playwright Chromium 打开 LAN 和公网，页面加载真实用户 Markdown 显示 4,811 行 / 381,305 字、19 个大纲、保存需授权提示（符合未授权无写行为），`pageerror=[]`，`apiWrites=[]`。

分别实际 `#module-select` 标题 → 媒体 → 标题 → 媒体：两入口各出现 **12 个真实媒体缩略图**，重复打开前后是相同 `img` DOM 节点 (`unchanged=true`)，无整列重建。独立隔离 fixture 的 Chrome + WebKit 三轮测试见 `MAIN_MEDIA_PREVIEW_SWITCH_STABILITY_20261027.md`，前 11 个缩略图 DOM 删除次数由 22 次降低为 0 次。

## 数据隔离与审计边界

下列文件在发布前后 SHA256 完全一致：

- Main 母 Markdown `.v6/workspace/buffetts-alpha.minerujson.md`: `c998da7aeea5410f1d7be10975c05e59efb5cdf6bfcf750595b27a048c5e3e19`
- Main 全局设置 `.v6/settings.json`: `18fdc687751150f8f0c994c9889b36caf326c8e1482ddacededc6362e5c07c23`
- 冻结 Lab `.runtime/document.md`: `649c0de9ce82896ef2c7a04f4fea0cc79ade32d0657cc3ebc47cc9d9864ebe6f`

冻结 Lab 没有合并/修改或再次发布；外部 Grok/Muse 审计快照 `9953137` 未变化。此新提交需在后续审计中作为 Main 增量被检查，不冒充两位审计员已签字。发布内外网仅供用户实机验收，不代表独立全量审计完成。
