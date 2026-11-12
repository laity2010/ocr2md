# Lab OCR · 公网服务器目录授权接入（2026-11-12）

## 故障与原因

公网访问 `https://ocr2md.laity.bid/labs/lab-ocr/` 时，目录树使用 Main 的 `/api/workspace/roots` 和 `/api/workspace/browse`。未建立 **Main 的 v6edit HttpOnly 编辑会话** 时，Main 返回 `403 Editor authorization required`，即使 Lab 的静态页面、PDF.js 正常加载也不得查看目录。`/api/session` 提供 `canSave` 验证，`POST /api/unlock` 接受 Main 原有的 12 位编辑授权码并由 Main 设置安全 Cookie。

## 最小修复

- **不修改 Main 授权后端、Token、工作区根目录或代理**，也不开放匿名目录读取，不读取私密 Token 内容。
- `frameDirectoryPort` 在原有报错文本之外提供 `error.status===403`，使 Lab 装配层能识别明确的未授权错误，不再依赖字符串匹配。
- `lab-ocr` 入口装配层仅在 `roots()` / `browse()` 返回 403 时，动态加载 `createMainEditorAuthorization()`。该薄适配器复用**现有 Main API**：向同源 `/api/unlock` 提交编辑码，必须经 `/api/session` 确认 `canSave===true` 才算通过。成功后只重试**原来那一次**目录请求，不进入第二套授权机制，也不放宽 Main 的服务端权限判断。
- 失败和取消均不能重试目录请求；授权码仅存在口令输入框和请求瞬时内存中，输入后清空；无本地存储、日志或文档写入。只显示错误原因，不反射用户输入的码。多次并发 403 共用一份授权提示。
- 公共 `lab-frame` 的目录 Port 与设置注册不变；仅 `lab-ocr` 额外包装其目录请求。公开 UI 与数据权限继续由 Main 根目录 allowlist 控制。

## 验收

`tests/lab-ocr-main-editor-authorization.browser.test.mjs` 在 Chromium/iPad WebKit 使用**虚构编辑码和模拟 Main HTTP 响应**，验证未授权无目录、取消不重试、错误码被拒、正确授权验证会话后自动重试、目录可选择、保存必须显式点击，HttpOnly Cookie 存在且原码不进入 Lab localStorage。

独立公网黑盒：不带编辑 Cookie 的 `/api/workspace/roots` 返回 403，`/api/session` 返回 `canSave:false`，使用无效码 POST `/api/unlock` 返回 403；该检查只验证安全拒绝路径，不测试真实私有授权码。实际用户编辑码验收仍需本人在公网浏览器执行。
