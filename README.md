# DeepSeek Harness Desktop

DeepSeek Harness 的 Windows 桌面封装（Electron）。免安装 Node.js，双击即用。

当前版本：0.1.0（内置 `@deepseek-ai/dsh@0.1.0-rc.6`）

## 使用

1. 下载 `DeepSeek Harness Setup 0.1.0.exe`（注意：文件名含空格）并安装
   - 未签名，SmartScreen 会提示"未知发布者"：点击"更多信息"→"仍要运行"即可
2. 启动后在 **Settings → Models** 填入你的 DeepSeek API key
3. 选择 workspace 并开始使用

## 插件

**内置插件管理器**（顶部菜单：插件管理 / 插件市场 / 环境管理）：

- **插件管理**：按 bundle 分组查看所有插件行，行级启停开关（**HMR 即时生效，零重启**）；安装 npm/git 插件（bundle 插件装后一键重启，非 bundle 插件实时挂载）；卸载（核心组件 base/web-app/headless 受保护不可卸载）
- **插件市场**：浏览 awesome-dsh-plugins 收录的社区插件（✅ 已验证 / 待测），搜索、一键安装
- **环境管理**：多 profile 管理（创建/重命名/删除/复制）与切换启动

**主题同步**：子窗口自动跟随 dsh UI 主题（亮/暗、插件皮肤），无需手动设置。

> 说明：v2 起不再预装第三方 dsh-web-plugin-manager，其能力已内置。

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
