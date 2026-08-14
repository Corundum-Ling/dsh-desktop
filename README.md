# DeepSeek Harness Desktop

[English](README.en.md) | 简体中文

面向 Windows x64 的非官方 DeepSeek Harness 桌面封装。安装包内置 Node.js、pnpm 和固定版本的 `@deepseek-ai/dsh`，无需单独配置 Node.js 环境。

> 本项目是社区封装，不是 DeepSeek 官方发行版，也不代表 DeepSeek 提供支持或安全背书。DeepSeek Harness 仍处于开发者预览阶段。

## 版本

| 组件 | 版本 |
|---|---|
| DeepSeek Harness Desktop | `0.1.0` |
| `@deepseek-ai/dsh` | `0.1.0-rc.6` |
| Node.js | `24.4.0` |
| pnpm | `10.8.0` |
| pnpm 独立程序内置 Node.js | `20.11.1` |

## 功能

- 将上游 dsh Web UI 封装为 Windows 桌面应用。
- 内置运行时，启动后仅在本机回环地址 `127.0.0.1` 提供服务。
- 顶部入口提供插件管理、社区插件市场和 profile 环境管理。
- 插件按 bundle 分组显示，支持配置行启停、npm/Git 安装和非核心组件卸载。
- 插件市场读取 [awesome-dsh-plugins](https://github.com/AdamPlatin123/awesome-dsh-plugins)，支持搜索、缓存和一键安装。
- 支持创建、复制、重命名、删除和切换 Web profile。
- 管理窗口跟随 dsh 的亮色、暗色和插件主题。
- 单实例运行；dsh 异常退出时最多自动重启两次。
- Windows 原生窗口按钮、圆角、阴影和边缘缩放。

## 系统要求

- Windows 10 或 Windows 11，x64。
- 约 1 GB 可用磁盘空间。
- 模型调用、插件市场和插件安装需要网络连接。
- 需要自行准备模型提供方的 API Key。当前快速开始以 DeepSeek API 为例。

当前只提供 NSIS 安装包，没有 portable 版本，也没有自动更新。

## 下载与安装

1. 从 GitHub Releases 下载 `DeepSeek Harness Setup 0.1.0.exe`。
2. 运行安装器并选择安装目录。
3. 安装器会创建桌面和开始菜单快捷方式。

安装包目前没有代码签名。Windows SmartScreen 可能显示“未知发布者”：核对下载来源和 Release 中的 SHA-256 后，点击“更多信息”再选择“仍要运行”。

## 快速开始

1. 启动 DeepSeek Harness。
2. 打开 **Settings → Models**，填写模型配置和 API Key。
3. 选择一个专用 workspace。
4. 检查会话的权限和工具批准设置，再开始任务。
5. 使用窗口顶部的“插件管理”“插件市场”和“环境管理”入口管理桌面扩展功能。

DeepSeek Harness 是本地 Agent 系统，不是只读聊天客户端。根据你的授权，它可以读取和修改 workspace 文件、运行 PowerShell 或 Shell 命令、访问网络并调用其他工具。首次使用请选择独立测试目录，不要直接选择整个用户目录、同步盘根目录或没有备份的重要仓库。

## 插件

### Bundle 插件

带有 `dsh.bundle` manifest 的插件由 dsh bundle 系统加载。安装、卸载和启停配置后，桌面端会在需要时重启 dsh 使配置生效。

### 非 Bundle 插件

内置 dsh `0.1.0-rc.6` 已确认无法激活没有 `dsh.bundle` manifest 的 insert 插件。桌面端可以安装依赖并保留 `cordis.patch.yml` 挂载配置，但插件功能当前不可用。该配置只为未来的上游兼容保留。

对非 bundle 行执行“卸载”时，桌面端可能只移除挂载配置，依赖文件仍可能保留在对应 profile 中。

### 插件安全

第三方插件不是沙箱扩展。它们以当前 Windows 用户权限运行，可能访问 workspace、应用数据、环境变量、网络和本地工具。只安装你信任的来源，并在安装前查看仓库代码、维护状态和发布记录。

插件市场中的“已验证”来自社区列表标记。本桌面应用没有因此完成代码审计、签名验证、哈希固定或持续安全背书。

## Profile 环境

环境管理支持创建、复制、重命名、删除和切换 Web profile。切换 profile 会重启 dsh。

请注意：

- 应用每次启动默认进入 `web` profile，不恢复上次选择。
- UI 当前只能创建 Web profile。
- 删除 profile 不经过回收站，操作不可撤销。
- 不要重命名或删除正在运行的 profile；当前版本不会完整同步运行状态。
- 复制大型 profile 会复制其本地依赖，操作期间窗口可能短暂无响应。

操作前建议备份 `%APPDATA%\DeepSeekHarness\dsh-home\profiles\`。

## 隐私与本地数据

应用数据保存在 `%APPDATA%\DeepSeekHarness\`：

| 路径 | 内容 |
|---|---|
| `config.json` | 桌面封装配置 |
| `logs\dsh.log` | dsh 标准输出和错误日志 |
| `marketplace-cache\marketplace.json` | 插件市场缓存 |
| `dsh-home\.credentials.yaml` | 模型凭证 |
| `dsh-home\profiles\` | profile 配置、插件和依赖 |
| `dsh-home\storages\` | 会话及上游 dsh 存储 |

模型凭证保存在本机文件中，不使用 Windows Credential Manager 或 DPAPI 加密。不要把整个 `%APPDATA%\DeepSeekHarness\` 上传到 Issue、网盘或公开日志。`dsh.log`、会话、缓存和 Chromium 数据也可能包含文件路径、命令输出或其他敏感内容。

卸载程序不会删除这些数据。彻底清除前先退出应用并备份需要保留的 profile，然后手动删除 `%APPDATA%\DeepSeekHarness\`。

### 网络请求与遥测

- 模型请求发送到你配置的模型提供方。
- 插件市场读取 GitHub 上的 `awesome-dsh-plugins`。
- 插件安装可能访问 npm、GitHub 或你输入的 Git 地址。
- 内置 dsh profile 默认关闭遥测。
- 外部环境变量 `DSH_TELEMETRY_MODE` 可以改变上游遥测行为；`DSH_TELEMETRY_DISABLED` 可强制关闭遥测。

启用上游完整遥测时，消息、工具参数、工具结果、命令输出、文件内容和本地路径可能进入遥测数据。请在启用前阅读上游文档并确认组织的数据政策。

## 已知限制

- 仅支持 Windows x64。
- 安装包未签名，SmartScreen 会显示未知发布者。
- 没有自动更新。
- 内置 dsh 是 RC 预览版本，上游升级可能产生破坏性变更。
- 本地端口只在 `3080-3090` 范围内选择。
- 启动等待上限为 30 秒。
- 非 bundle 插件在内置 dsh 版本中不可用。
- profile 管理仍有上述运行状态限制。
- 关闭所有应用窗口会停止本地 dsh 服务，不提供托盘常驻。

升级或重置前请备份 `%APPDATA%\DeepSeekHarness\`。

## 故障排查

### SmartScreen 阻止安装

确认安装器来自项目 Release，并核对 SHA-256。安装包未签名，因此 Windows 会显示未知发布者。

### dsh 启动失败

1. 检查 `3080-3090` 是否全部被占用。
2. 打开 `%APPDATA%\DeepSeekHarness\logs\dsh.log` 查看错误。
3. 结束残留的 DeepSeek Harness 或内置 Node 进程后重试。

### 插件安装失败

检查网络、npm/Git 地址和输出区日志。单次插件操作的默认超时为 120 秒。社区插件与当前 dsh RC 版本可能不兼容。

### 安全重置

1. 退出应用。
2. 备份 `%APPDATA%\DeepSeekHarness\dsh-home\profiles\` 和需要的会话。
3. 将 `%APPDATA%\DeepSeekHarness\` 移到其他位置。
4. 重新启动应用生成干净数据目录。

确认不再需要备份后再手动删除。不要在未备份时直接清空用户数据。

## 开发

```powershell
npm ci
npm run prepare:resources
npm test
npm run check:release
npm start
npm run dist
```

`prepare:resources` 下载并准备固定版本的 Node.js、pnpm、dsh，以及两个 Node.js 运行时和 pnpm 的官方许可原文。pnpm 的 Windows 独立程序自身内置 Node.js `20.11.1`。生成内容保存在被 Git 忽略的 `resources/` 中。

资源脚本会验证已有 Node.js、pnpm（含其内置 Node.js）和 dsh 的版本，并核对许可原文的固定上游 Git blob 哈希。升级任一内置组件时，仍应先备份并清理对应的 `resources/` 子目录，再运行资源准备命令；公开构建还应核对运行时下载来源和哈希。

安装包输出到 `dist/DeepSeek Harness Setup <版本>.exe`。`npm run dist` 会先自动执行发布门禁，检查 Git 候选文件和实际打包资源中的敏感路径及常见凭证格式。发布时只上传安装器、SHA-256、发布说明和必要许可文件，不要上传 `dist/win-unpacked` 或 `builder-debug.yml`。

## 项目结构

```text
assets/                 图标源文件
build/                  Windows 构建资产
docs/architecture/      架构和渲染契约
scripts/                资源准备与冒烟脚本
src/main/               Electron 主进程
src/main/services/      dsh、插件、市场和 profile 服务
src/preload/            contextBridge 与主窗口主题探针
src/renderer/           三个管理窗口和共享主题样式
test/                   Vitest 测试
```

主进程启动内置 dsh，并将上游 Web UI 加载到主窗口。三个本地管理窗口通过受限的 preload API 调用主进程服务。详细边界见 [`docs/architecture/renderer-contract.md`](docs/architecture/renderer-contract.md)。

## 发版检查

1. 同步 `package.json` 版本和 `scripts/prepare-resources.mjs` 中的组件版本。
2. 从干净的 `resources/` 重新准备运行时。
3. 运行 `npm test`、`npm run check:release`、`npm run smoke:install` 和真实安装/卸载检查；门禁会扫描包括 Git 忽略资源在内的实际打包输入。
4. 运行 `npm run dist`。
5. 确认 EXE、安装器、快捷方式和卸载器图标。
6. 确认 Git 和安装包中没有 `.superpowers`、凭证、Cookie、日志或用户数据。
7. 生成安装器 SHA-256 并写入 Release。

## 许可证与归属

本桌面封装采用 [MIT License](LICENSE)。分发的第三方组件使用各自许可证，见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 由 DeepSeek 开发并采用 MIT License。DeepSeek 名称和鲸鱼标识属于其各自权利人。本项目对名称和标识的使用仅用于说明兼容对象，不表示官方合作、认可或支持。
