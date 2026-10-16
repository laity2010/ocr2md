# iPad Safari 实机网页截图（OCR2MD/WCP）

## 目标与边界

从**已经配对的实体 iPad Safari** 抓取网页实际渲染的可视区域，作为 V4/V5/WCP 的实机验收证据。无需把 iPad 屏幕镜像到 Mac，也不安装 Xcode、不启动常驻的 CDP 9223 服务、不修改网站数据。当前流程使用苹果的 **Web Inspector / WebKit `Page.snapshotRect`**，但连接层依赖已安装的开源 Python 工具 `pymobiledevice3`；**不是纯苹果官方 CLI**。

与 Playwright 的差别：Playwright 在 Mac 上模拟 WebKit，不能因此称为实体 iPad Safari 实测。本工具有明确的设备/URL/像素验证。它只截取网页 viewport，不包含 Safari 地址栏、控制中心、iPad 系统界面；整屏采集不在本流程内。

## 前提

1. Mac 和 iPad 已配对并通过无线/USB 可访问（`idevice_id -n -l` 可见设备）；iPad Safari 的「高级 → 网页检查器」开启。
2. Mac 上已安装 Python 3.13 及 `pymobiledevice3`；检查 `python3 -m pymobiledevice3 version`。
3. iPad Safari 保持打开待验收页面。Mac Safari 的人工「网页检查器」窗口保持关闭，避免调试会话冲突。
4. 不要求 iPad AirPlay 投屏、Mac 的屏幕录制权限、`safaridriver` 远程自动化权限、Xcode、管理员权限。

## 一条命令截图

在 OCR2MD 仓库根目录运行（如果同时连接多个 iOS 设备，请明确指定 `--udid`）：

```sh
python3 scripts/ipad_safari_capture.py \
  --url-contains '/v4-wp3-candidate/' \
  --output /tmp/ocr2md-ipad-safari.png
```

指定实体设备：

```sh
idevice_id -n -l
python3 scripts/ipad_safari_capture.py \
  --udid '在上一步返回的设备UDID' \
  --url-contains '/v4-wp3-candidate/' \
  --output /tmp/ocr2md-ipad-safari.png
```

V5 发布后使用它自身的 URL 特征（例如 `/v5-directory/`），避免把 V4 的旧图片当作 V5 验收。工具仅允许匹配唯一的 iPad Safari 标签页，并在截图前读回网页当前 `location.href`、viewport、DPR 和 iPad 页面时钟；JPEG/模拟图片会被拒绝。

成功时输出一行 JSON：`ok`、截图路径、实际页 URL、标题、CSS viewport、原始 PNG 尺寸、SHA-256、截图时间。失败时输出 `NO_SCREENSHOT` 并以非零代码退出，**不会拿旧文件充当新图**。

## 工作机制与维护

- `pymobiledevice3` 连接苹果 Web Inspector 服务，获取设备真实 Safari 标签页。
- 建立临时检查会话并执行只读的 `Runtime.evaluate` 核对当前页面、DPR、viewport。
- 向 iPad WebKit 发出 `Page.snapshotRect`，直接取得设备生成的 PNG；核对 PNG 文件头及尺寸后原子写入输出路径。
- 调用结束主动关闭检查连接，不保留 daemon、端口或浏览器自动化进程。
- iPadOS 27 的 targetCreated 事件存在异步延迟；工具发送一次无导航副作用的 target discovery probe 唤醒事件，并按时间界限等待。必要时新建连接重试 1 次。

已知限制：如果用户打开 Mac Safari 人工检查器、设备断线、切换网页、iPad Web Inspector 被别的会话占用、或者网页处于不接受调试的状态，可能需要关闭检查器或重新唤醒 iPad。工具会明确报告失败。不能自动化 iPad 系统 UI 操作。

## 实机验收

每次升级本工具：重复执行两次上述命令，检查实时目标地址与 PNG 尺寸，且从**第二次实际生成的**新文件展示给用户。截图始终区分 V4/V5，并禁止把 Playwright WebKit 视口截图标为实机。
