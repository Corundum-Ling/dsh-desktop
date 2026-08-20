# DeepSeek Harness Desktop

[English](README.en.md) | 简体中文

面向 Windows x64 的非官方 DeepSeek Harness 桌面封装。安装包内置 Node.js、pnpm 和固定版本的 `@deepseek-ai/dsh`，无需单独配置 Node.js 环境。

> 本项目是社区封装，不是 DeepSeek 官方发行版，也不代表 DeepSeek 提供支持或安全背书。DeepSeek Harness 仍处于开发者预览阶段。

## 版本

| 组件 | 版本 |
|---|---|
| DeepSeek Harness Desktop | `0.1.1` |
| `@deepseek-ai/dsh` | `0.1.0-rc.8` |
| Node.js | `24.4.0` |
| pnpm | `10.8.0` |
| pnpm 独立程序内置 Node.js | `20.11.1` |

## 功能

- 将上游 dsh Web UI 封装为 Windows 桌面应用。
- 内置运行时，启动后仅在本机回环地址 `127.0.0.1` 提供服务。
- 顶部入口提供插件管理、社区插件市场和 profile 环境管理。
- 插件按 bundle 分组显示，支持配置行启停、npm/Git 安装和非核心组件卸载。
- 插件市场读取 [awesome-dsh-plugins](https://github.com/AdamPlatin123/awesome-dsh-plugins) 完整生态目录，支持搜索、类型与分类筛选、详情查看、缓存和兼容插件安装。
- 支持创建、复制、重命名、删除和切换 Web profile。
- 管理窗口跟随 dsh 的亮色、暗色和插件主题。
- 单实例运行；dsh 异常退出时最多自动重启两次。
- Windows 原生窗口按钮、圆角、阴影和边缘缩放。

## 系统要求

- Windows 10 或 Windows 11，x64。
- 约 1 GB 可用磁盘空间。
- 模型调用、插件市场和插件安装需要网络连接。
- 需要自行准备模型提供方的 API Key。当前快速开始以 DeepSeek API 为例。

当前只提供 NSIS 安装包，没有 portable 版本。

## 下载与安装

1. 从 GitHub Releases 下载 `DeepSeek Harness Setup 0.1.1.exe`。
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

内置 dsh `0.1.0-rc.8` 仍未确认可以激活没有 `dsh.bundle` manifest 的 insert 插件。桌面端可以安装依赖并保留 `cordis.patch.yml` 挂载配置；在未完成真实验证前，继续按不可用处理。

对非 bundle 行执行“卸载”时，桌面端可能只移除挂载配置，依赖文件仍可能保留在对应 profile 中。

### 插件安全

第三方插件不是沙箱扩展。它们以当前 Windows 用户权限运行，可能访问 workspace、应用数据、环境变量、网络和本地工具。只安装你信任的来源，并在安装前查看仓库代码、维护状态和发布记录。

插件市场中的“已验证”来自社区列表标记。本桌面应用没有因此完成代码审计、签名验证、哈希固定或持续安全背书。

从插件市场安装前，桌面端会检查仓库根目录的 `package.json` 和 `dsh.bundle` manifest；需要运行 `prepare` 构建脚本时，还会要求用户对当前 profile 中的精确包名单独授权。

## Profile 环境

环境管理支持创建、复制、重命名、删除和切换 Web profile。切换 profile 会重启 dsh。

请注意：

- 应用冷启动时恢复最后一次成功使用的 profile；如果该 profile 不存在或启动失败，则回退到 `web`。
- UI 当前只能创建 Web profile；新建 profile 使用空依赖的最小模板。
- 删除 profile 不经过回收站，操作不可撤销。
- 不要重命名或删除正在运行的 profile；当前版本不会完整同步运行状态。
- 复制 profile 会保留配置和依赖声明，但不会复制 `node_modules`；切换后安装插件时会为目标 profile 单独准备依赖。

操作前建议备份 `%APPDATA%\DeepSeekHarness\dsh-home\profiles\`。

## 已知限制

- 仅支持 Windows x64。
- 安装包未签名，SmartScreen 会显示未知发布者。
- 启动后每天最多自动检查一次本项目的稳定版更新；更新需用户确认后前往 GitHub Release 页面下载安装。
- 内置 dsh 是 RC 预览版本，上游升级可能产生破坏性变更。
- 本地端口只在 `3080-3090` 范围内选择。
- 启动等待上限为 30 秒。
- 非 bundle 插件在内置 dsh 版本中默认按不可用处理。
- profile 管理仍有上述运行状态限制。
- 关闭所有应用窗口会停止本地 dsh 服务，不提供托盘常驻。

升级或重置前请备份 `%APPDATA%\DeepSeekHarness\`。

## 开发

```powershell
npm ci
npm run prepare:resources
npm test
npm run check:release
npm start
npm run dist
```

`prepare:resources` 下载并准备固定版本的 Node.js、pnpm、dsh，以及两个 Node.js 运行时和 pnpm 的官方许可原文。pnpm 的 Windows 独立程序自身内置 Node.js `20.11.1`。生成内容保存在被 Git 忽略的 `resources/` 中。dsh 升级先在临时目录完成安装和版本校验，再替换旧资源，失败时保留旧版本。

资源脚本会验证已有 Node.js、pnpm（含其内置 Node.js）和 dsh 的版本，并核对许可原文的固定上游 Git blob 哈希。升级任一内置组件时，仍应先备份用户数据，再运行资源准备命令；公开构建还应核对运行时下载来源和哈希。

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

## 许可证与归属

本桌面封装采用 [MIT License](LICENSE)。分发的第三方组件使用各自许可证，见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 由 DeepSeek 开发并采用 MIT License。DeepSeek 名称和鲸鱼标识属于其各自权利人。本项目对名称和标识的使用仅用于说明兼容对象，不表示官方合作、认可或支持。
