# WP29 · V1 媒体 View
基线 bca579a / 261124-222016。复用 bf32515 的 media-view.js（仅 V2 API 路径、销毁门禁、替换失败提示适配）、media-view.css、已存在且与 V1 cmp 一致的 media-module.js 和 scripts/v6_media.py。AG 采用 V1 列定义、固定列、78px 行高、缩略图、动作、功能菜单；同一现有 AG 实例，不修改其它视图或框架。清单为实时 CM6 MD Line + 授权工作目录 inventory 派生；稳定逻辑 ID、当前物理行及 URL 字符范围核对，所有替换通过唯一 CM6 replaceMdLines 事务，原 SQLite 旧值 CAS 保存。下载状态来自同一 V1 分块文件/metadata；不增加 SQL 表或另存正文。MD preview 仅将已批准的本地 media/哈希文件地址改为 V2 授权媒体 API 请求，不改变源码。仅支持 V1 已允许的 MinerU CDN 及 JPG/JPEG/PNG/GIF/WebP；不扩展任意网络主机、上传或剪贴板粘贴功能。
测试：
- tests/test_v2_media.py PASS：真实 loopback HTTP Range 分块 524288 字节与下一段、原子发布、重复下载无网络、GET 状态无新目录、库存、二进制读取、非法 URL/路径、方法和符号链接拒绝。F02 probe 是隔离 Stub；生产 handler 继续使用既有 cookie/目录及 POST Origin 检查。
- V2_TEST_MEDIA_VIEW=1 node tests/v2-owned-edit.browser.test.mjs Chromium/WebKit PASS：隔离 SQLite 中两处相同远端链接、真实本地文件预览、未引用文件、实际 AG 固定列、链接统一替换一次 1 块 CAS 保存、实际 MD img naturalWidth、Undo/Redo/reopen、标题列序保持。预下载 fixture，不访问 CDN。
- tests/v2-media-direct.browser.test.mjs Chromium/WebKit PASS：V1 控制器以受控 transport 模拟分块状态，实际暂停按钮、续传与批量替换、精确源位置与过期引用拒绝、同 URL 两处一次替换，保留尖括号语法。真正 Range 网络由上述独立 Python 测试验证。
- AG、MD Line、断块、注释、LaTeX 直接回归、联邦布局检查通过。
实际用户书籍未下载、未修改。真实远端 CDN 可达性和物理 iPad 验收待用户操作验证。
