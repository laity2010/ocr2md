# OCR2MD V5 · WP0 技术继承底座

V5 是 V4 架构的渐进式继承，不从头重建 WCP，业务模块逐一接入。

WP0 使用 V4 已发布的 WCP Loader 0.1.7（回退 0.1.6）、TriPane 0.2.1 和 ResidentHost 1.0.0 的 SHA 校验公共资产，以及原有 manifest 插件发现算法；只启动内建技术占位模块，不加载旧 V4 的 Settings、工作目录、文件服务、章节定界/清洗或媒体功能，不访问真实 Vault。

## 本地可验证入口

```bash
cd ui-spikes/v5-directory
npm ci --offline                           # 仅本包 TypeScript 静态检查工具
npm run build                              # 按插件 manifest 生成注册表
npm run test:wp0                           # V4冻结与真实 Chromium/WebKit
npm run test:isolated                      # 仓库外独立 npm ci + 两浏览器启动
python3 -m http.server 18085 --bind 127.0.0.1 --directory .
# 浏览器打开 http://127.0.0.1:18085/
```

**独立 AEL（初始化过一次；不要重复 init）**

V5 AEL 使用模块归属字段记录每个插件的变更、测试、用时与越界提示；这是一份 V5 独立 SQLite 账本中的逐模块记录，不要求为每个 UI 插件复制一个数据库或重新发明框架。

```bash
python3 scripts/ael.py check
python3 scripts/ael.py begin --module settings --category migration --task 'WP1 Settings'
python3 scripts/ael.py test --name settings-contract -- node tests/...
python3 scripts/ael.py finish --result passed
python3 scripts/ael.py report
```

源码归属和冻结声明在 [INHERITANCE_CONTRACT.md](./INHERITANCE_CONTRACT.md)；[baseline/v4-freeze.json](./baseline/v4-freeze.json) 为不可变的 WP0 历史 SHA 快照。V5 的 AEL SQLite 仅在 `.runtime/ael.sqlite`，不共享 V4 的账本。正常构建只生成本地插件注册表，不执行 V4 发布脚本。

> WP0 是底座贯通及基线冻结验收，**不是 V4 全功能已在 V5 通过测试**，也不表示已部署公网/局域网正式入口。
