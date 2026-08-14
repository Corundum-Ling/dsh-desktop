# DeepSeek Harness Desktop

DeepSeek Harness 的 Windows 桌面封装（Electron）。免安装 Node.js，双击即用。

当前版本：0.1.0（内置 `@deepseek-ai/dsh@0.1.0-rc.6`）

## 使用

1. 下载 `DeepSeek Harness Setup 0.1.0.exe`（注意：文件名含空格）并安装
   - 未签名，SmartScreen 会提示"未知发布者"：点击"更多信息"→"仍要运行"即可
2. 启动后在 **Settings → Models** 填入你的 DeepSeek API key
3. 选择 workspace 并开始使用

## 插件

**预装 [dsh-web-plugin-manager](https://github.com/LX2000WASD/dsh-web-plugin-manager)**（MIT，首次启动自动安装）：

- Web UI **设置 → 插件**：查看/实时启停（非 bundle 插件零重启）、安装/卸载、环境管理
- Web UI **市场**：浏览 awesome-dsh-plugins 插件市场，一键安装
- 若预装失败（网络等原因），应用仍正常启动，可稍后自行安装：
  `dsh plugin --profile web add dsh-web-plugin-manager`
- 卸载后不会自动重装（尊重你的选择，需要时从市场重新安装）

**备用入口**：菜单 **应用 → 插件管理**（Electron 窗口，走官方 `dsh plugin` 命令）：

- 支持 npm 包名与 `github:user/repo` 形式；git 插件若因 pnpm 构建权限失败，请改用 npm 已发布包
- bundle 插件安装/卸载后需要重启生效（自动执行，UI 短暂重新加载属正常现象）；非 bundle 插件可在 Web UI 里实时启停

## 数据位置

- 应用数据：`%APPDATA%/DeepSeekHarness/`（凭证、配置、插件）
- 日志：`%APPDATA%/DeepSeekHarness/logs/dsh.log`
- 卸载程序不会清除应用数据，需要手动删除上述目录

## 开发

```bash
npm install
npm run prepare:resources   # 下载 node/pnpm + 安装固定版本 dsh
npm start                   # 开发运行（需 resources 就绪）
npm test                    # vitest 单测
npm run dist                # 构建 NSIS 安装包
```

## 发版流程

1. 修改 `scripts/prepare-resources.mjs` 顶部的 `DSH_VERSION`（及 Node/pnpm 版本）
2. 更新 `package.json` 版本号
3. **升级前必须删除 `resources/` 目录**——prepare:resources 的幂等检查只看存在性不比版本，不删目录会导致打包仍旧版本
4. `npm run prepare:resources`
5. `npm run dist`
6. 上传 `dist/DeepSeek Harness Setup <版本>.exe` 到 GitHub Releases，附改动说明

## 已知限制

- 仅 Windows x64
- 未签名（SmartScreen 会提示"未知发布者"）
- dsh 为 developer preview，新版本可能有破坏性变更——升级前备份 `%APPDATA%/DeepSeekHarness/`
