# Renderer Contract

> Applies to DeepSeek Harness Desktop 0.1.0. Last verified against the current `main` worktree on 2026-08-14.
>
> This document defines the stable boundary between the Electron main process, preload scripts, and local management renderers.

---

## 1. 项目背景（30 秒速览）

The application has one primary window for the upstream dsh Web UI and three local management windows:

| 窗口 | 文件 | 功能 |
|---|---|---|
| 插件管理 | `src/renderer/plugin/index.html/js` | 插件行列表 + 行级启停 + 安装/卸载 |
| 插件市场 | `src/renderer/marketplace/index.html/js` | 社区插件卡片浏览 + 搜索 + 一键安装 |
| 环境管理 | `src/renderer/environment/index.html/js` | dsh profile（环境）的创建/重命名/删除/复制/切换 |

技术形态：**纯 HTML/CSS/JS（无框架）**，`loadFile` 加载本地页面，经典 `<script src>`（非 module），渲染层**无 Node 能力**（沙箱 + contextIsolation）。

---

## 2. 硬性约束（不可破坏，违反会导致功能失效）

### 2.1 主题同步机制（最重要）

dsh UI 有亮/暗主题 + 插件可换肤。我们的二级窗口通过**动态同步 dsh 的实际主题变量**保持一致：

- **所有颜色必须用 CSS 变量 `var(--dsw-*)` 引用**（如 `var(--dsw-alias-bg-base)`、`var(--dsw-alias-label-primary)`）——**禁止硬编码颜色值**
- 变量值由 `src/renderer/shared/theme-applier.js` 从主窗口动态注入（每 2s 同步 + 事件驱动）——设计时只需引用变量名，值会自动跟随
- **默认兜底值**定义在 `src/renderer/shared/window-theme.css` 的 `:root`（亮色默认）——新增 CSS 变量时在这里补兜底
- `body[data-ds-dark-theme]` 属性由 `theme-applier.js` 切换（当前无 CSS 依赖它，但**保留该属性的切换逻辑**，未来暗色选择器可用）
- 常用变量速查（完整清单见 dsh UI 的 CSS，`--dsw-alias-*` 随主题变化）：
  - 背景：`--dsw-alias-bg-base`（页面）/ `--dsw-alias-bg-layer-1`（浅层卡片/顶栏）
  - 文字：`--dsw-alias-label-primary`（主）/ `--dsw-alias-label-secondary`（次）
  - 边框：`--dsw-alias-border-l1`（细）/ `--dsw-alias-border-l2`（粗）
  - 语义色：`--dsw-alias-state-success-primary`（绿）/ `--dsw-alias-state-error-primary`（红）/ `--dsw-alias-state-warn-primary`（黄）
  - 品牌/按钮：`--dsw-alias-button-primary-fill` + `--dsw-alias-label-primary-foreground`（主按钮配色）
  - 代码/输出：`--dsw-alias-markdown-code-block`

### 2.2 渲染层能力边界

- **无 `require` / `import` / Node API**（沙箱开启）
- **唯一入口**：`window.pluginApi`（13 个方法，见 §3.1）+ `window.themeApi`（2 个方法，见 §3.2）——由 `src/preload/management.cjs` 注入，**不要新增 IPC 通道**（除非与后端协商）
- **禁止** `window.prompt()` / `window.open()`（Electron 渲染进程不支持/被禁）
- 对话框用页面内元素实现（现有 `askInput` 模式可参考 `src/renderer/environment/index.js`）

### 2.3 窗口行为（`src/main/index.js` 已配置，UI 无需管）

- 二级窗口：附属、非模态、单例、无菜单栏；主窗口关闭时跟随关闭
- 尺寸/标题在 `src/main/index.js` 的 `openChildWindow()` 配置

---

## 3. 预留接口（JS 依赖，UI 必须保留）

### 3.1 `window.pluginApi`（`src/preload/management.cjs` 暴露，渲染层唯一后端入口）

```
list()                      → {rows, inserts, bundles}   // 插件行树（id/name/bundle/disabled/core）+ insert 行 + bundle 列表
setEnabled(entryId, enabled) → {ok, output}               // 行级启停（写 patch）
install(spec)               → {ok, output, needsRestart}  // 安装（npm/git spec）
remove(name)                → {ok, output, needsRestart}  // 卸载
removeInsert(rowId)         → {ok, output}                // 卸载非 bundle insert 行
marketplace(refresh)        → {plugins, fetchedAt, fromCache, stale?, error?}
listProfiles()              → [{name, bundles}]
createProfile(name, template) / renameProfile(old, new) / removeProfile(name) / copyProfile(from, to)
switchProfile(name)         → {ok}                        // 切换当前 dsh 运行 profile（自动重启）
restart()                   → 重启当前 dsh（装/卸/启停后生效）
```

### 3.2 `window.themeApi`

```
get()       → {isDark, variables}   // 当前主题（打开时先查）
onChange(cb) → 订阅主题变化广播（实时跟随）
```

### 3.3 必须保留的 DOM 元素（JS 按 id 引用，改名即断）

| 窗口 | id（不可改） | 用途 |
|---|---|---|
| plugin | `#status` `#spec` `#install-btn` `#plugin-list` `#output` | 状态栏 / 安装输入 / 安装按钮 / 插件列表容器 / 输出区 |
| marketplace | `#status` `#search` `#refresh-btn` `#list` `#output` | 状态栏 / 搜索 / 刷新 / 卡片容器 / 输出区 |
| env | `#status` `#new-name` `#create-btn` `#profile-list` `#output` | 状态栏 / 新建输入 / 创建按钮 / 列表容器 / 输出区 |

- **状态栏**（`#status`）：所有操作反馈都写这里——必须**常驻可见**、支持错误样式（.error class）
- **输出区**（`#output`）：安装/卸载的完整日志展示（含非 bundle 插件的如实警告）——保留 `hidden` 属性控制显隐
- 三个窗口共用 `src/renderer/shared/theme-applier.js`（HTML 末尾引用，勿删）

### 3.4 现有 CSS class 体系（`src/renderer/shared/window-theme.css`，可扩展不可删）

`topbar`（顶栏）/ `content`（内容区）/ `plugin-row`（列表行）/ `bundle-group`（分组标题）/ `switch`+`slider`（启停开关）/ `search-row`（输入行）/ `card`（市场卡片）/ `badge ok|warn`（状态徽章）/ `danger`（危险按钮）/ `primary`（主按钮）/ `status`+`error` / `output`

---

## 4. 功能元素清单（设计时必须保留这些交互）

- **插件窗口**：安装输入框 + 安装按钮 / 按 bundle 分组的插件行列表 / 每行一个**启停开关**（checkbox 样式）/ 非核心行的**卸载按钮** / 核心行的"核心"徽章 / 状态栏 + 输出区
- **市场窗口**：搜索框 / 刷新按钮 / 插件卡片（名称·说明·仓库·✅待测徽章·安装按钮）/ 状态栏 + 输出区
- **环境窗口**：新建 profile 输入 + 按钮 / profile 列表（每项：切换启动·复制·重命名·删除）/ 状态栏 + 输出区
- 所有按钮需要有**操作中禁用**（busy 防重入）状态

---

## 5. 视觉建议（自由发挥区）

- **最佳视觉参照 = dsh 主窗口本身**：它的配色、间距、圆角就是产品风格（同源变量保证一致）
- 当前实现是功能优先的朴素样式，布局/动效/密度/信息层级都可以重新设计
- 三个窗口风格必须统一（同一套变量 + 同一组件语言）
- 可参考 dsh 生态 UI 插件的设计（如 dsh-web-ui 的右侧面板风格）
- 窗口尺寸可调（`src/main/index.js` 的 `openChildWindow()`）

---

## 6. 验收清单（改动后必须过）

1. `npm start` 三个窗口正常打开、功能全部可用（列表/启停/安装/搜索/环境操作）
2. dsh UI 切亮/暗主题 → 三个窗口 2 秒内跟随（无硬编码颜色残留）
3. 主窗口关闭 → 三个窗口跟随关闭；二级窗口打开时主窗口仍可操作
4. 渲染进程零 console error
5. 无 `require`/`import`/`prompt` 出现在渲染层
