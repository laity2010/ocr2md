# Screenshot Bridge v1 · OCR2MD 私有截图 → 同域限时分享

组件位于 `scripts/screenshot_bridge.py`（独立只读文件服务）、`scripts/screenshot_bridge_cli.py`（本地操作入口）。V5 网关通过 `/__v5/screenshots/<48-hex>.png` **只读**引用该服务。不属于 WCP UI、工作目录、Settings 或 MOPJO，不导入业务模块。

## 真实 iPad Safari → 私有证据

前提：实体 iPad 与 Mac 已配对，`idevice_id -l` 可发现设备；iPad Safari 已开启“高级 → 网页检查器”，目标页面打开在 Safari 前台。`scripts/ipad_safari_capture.py` 只从已配对设备的 Apple Web Inspector 取 `Page.snapshotRect`，无模拟、无替代，也不需要新截图引擎。

```bash
cd /Users/daisor/AgentDock/ocr2md-codespaces-spike/ui-spikes/v5-directory
python3 scripts/screenshot_bridge_cli.py capture-ipad --url-contains ocr2md.laity.bid/
```

返回 `PRIVATE_REVIEW_REQUIRED`，PNG 保存在仓库私有 `.runtime/ocr2md-screenshot-bridge/private/`，默认**不**发布。设备未连接时明确返回失败，不能标注为实机截图。

## 人工复核 → HTTPS 同域链接

核实 PNG 中不含登录密钥、访问令牌、私人书籍正文及其他非预期暴露的内容后，执行：

```bash
python3 scripts/screenshot_bridge_cli.py publish "/path/to/PRIVATE_REVIEWED.png" \
  --label "iPad Safari 设置组件截图" --hours 2 --reviewed
```

仅能分享仓库私有 build-evidence 或截图桥 private 目录中的 PNG。返回 `SHARED_WITH_EXPIRY` 和 `https://ocr2md.laity.bid/__v5/screenshots/<随机ID>.png`。链接是 **bearer capability**，获得链接的任何人都能看到图像；默认 1 小时、最长 24 小时。地址不可猜测（192 位随机数），服务器端强制检查到期时间和 SHA256，无列目录、无上传、无原文件系统路径暴露、无服务端长驻截图设备连接。访客 GET/HEAD 可查看，其他方法禁止。需立即撤销时删除对应 private `shared/<ID>.png/.json`；链接过期自动停止访问（私有文件可按保留策略稍后清理）。

**重要区分**：通过公网看到截图文件，只证明 HTTPS 共享链路成功，不能保证 ChatGPT iPhone 消息内嵌图片控件会渲染；优先给同域原图链接，聊天内预览仍需要 ChatGPT 附件通道实际成功。V5 每次构建仍自动执行匿名 WebKit 截图与测试；实体 iPad 仅连接可用时单独截图。

## 回归

- `python3 tests/screenshot-bridge.test.py`: 匿名读、HEAD、错误 token、过期、篡改、symlink、禁止 POST
- `python3 tests/workspace-gateway.test.py`: 既有 Vault 授权/文件安全不受影响
- `python3 tests/single-release-parity.py`: LAN / 公网同一网关，拒绝旧路由
- `node scripts/check-plugin-boundaries.mjs`: WCP 插件边界
