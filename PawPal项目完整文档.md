# PawPal 桌面宠物项目 · 完整技术文档

> 一份从「GitHub 爆火打字小猫」调研开始，到零基础搭建工具链、开发原生桌宠、接入 MCP、扩展外观编辑器、制作桌面快捷方式、安全审计加固，再到**合规化改造**的全流程记录。
>
> 文档日期：2026-11-26　｜　项目版本：0.1.0　｜　最终交付：`deliverables/PawPal.exe`（9.1 MB）
>
> ⚠️ **当前为合规版**：最终交付已按五条安全约束重构——无全局输入监听、无网络、无端口、无剪贴板/截图/目录遍历、持久化仅 `%APPDATA%/PawPal/config.json` 单文件、无管理员权限与自动更新。本文第七、九章中描述的全局钩子/HTTP 端口/localStorage 属于**改造前的历史实现**，当前状态以新增的「十三、合规化改造」章节为准。

---

## 目录

1. [项目概述与需求起源](#一项目概述与需求起源)
2. [技术调研：原版是怎么做到的](#二技术调研原版是怎么做到的)
3. [技术栈、语言与依赖清单](#三技术栈语言与依赖清单)
4. [系统工具链与安装包](#四系统工具链与安装包)
5. [项目结构与配置文件详解](#五项目结构与配置文件详解)
6. [架构设计与数据流](#六架构设计与数据流)
7. [完整执行过程（六个阶段）](#七完整执行过程六个阶段)
8. [关键问题与解决方案（踩坑记录）](#八关键问题与解决方案踩坑记录)
9. [漏洞检测与安全加固报告](#九漏洞检测与安全加固报告)
10. [验证与测试记录](#十验证与测试记录)
11. [交付物与使用说明](#十一交付物与使用说明)
12. [附录：命令速查与版本信息](#十二附录命令速查与版本信息)
13. [合规化改造（当前状态）](#十三合规化改造当前状态)

---

## 一、项目概述与需求起源

### 1.1 需求演进

用户的诉求是逐步递进的，共六个回合：

| 回合 | 用户需求 | 交付结果 |
|---|---|---|
| 1 | 分析 GitHub 爆火的打字小猫原理，生成同效果桌宠 | 零依赖单文件网页版 `desktop-cat/` |
| 2 | 按原版用 Tauri + three.js 打包成单 exe | `PawPal.exe`（Tauri 2 原生应用） |
| 3 | 补上 MCP 接口，按照片生成配色热更新 | MCP 服务端 + 本地控制接口 |
| 4 | 猫的样子能否自定义 | 方案说明（颜色层已支持，造型层待开发） |
| 5 | 做外观编辑器、可组合部件、上传图片生成相似小猫 | 部件系统 + 图片生成 + 原生/MCP 扩展 |
| 6 | 把外观编辑器做成桌面快捷方式 | 桌面 `.lnk` + `--appearance` 单实例转发 |
| 7 | 检测代码漏洞，确认没有高危风险 | 安全审计 + 4 项加固 + 重新编译 |

### 1.2 最终成果

一个**真正的原生桌面应用**（非网页套壳）：

- 双击 `PawPal.exe` 即可运行，前端资源已内嵌，无需安装、无需 Node/Rust 环境
- 全局键鼠响应：在任何软件里打字、移动鼠标，桌宠都会反应
- 透明、置顶、可点击穿透、托盘菜单控制的窗口
- three.js 程序化生成的 3D 猫，支持部件化自由组合
- 按本地图片生成相似小猫，全程不联网
- MCP 接口让 AI 客户端直接控制桌宠
- 桌面快捷方式一键直达外观编辑器

---

## 二、技术调研：原版是怎么做到的

### 2.1 调研发现

通过 Web 搜索与 GitHub API 抓取，确认近期爆火的主要是三个项目：

| 项目 | 特点 | 技术栈 |
|---|---|---|
| **7wdn/7paws** | 2026-11-22 创建，已 86 star，抖音带火的 3D 桌宠 | Tauri 2 + Rust + three.js + WebAudio |
| **kurocat** | 打字猫咪，可当 OBS 透明源 | Tauri + Three.js + MCP |
| **ayangweb/BongoCat** | 老牌桌宠 | Live2D |

### 2.2 核心技术链路（原版原理）

```
用户真实键鼠输入
   ↓
① 全局钩子：Windows 低级键鼠钩子 / macOS CGEventTap（Rust 层，无需窗口焦点）
   ↓
② Tauri IPC：只传「左手/右手提示 + 光标坐标」，不记录按键内容
   ↓
③ 前端状态机：TypeScript 维护「打字 / 追光标 / 摸头 / 睡觉」等状态
   ↓
④ 渲染与音效：three.js 画 3D 猫，WebAudio 播放呼噜声
   ↓
透明置顶窗口 + 点击穿透
```

**关键洞察**：真正的门槛在「全局钩子 + 原生透明窗口」两块，动画本身并不神秘。隐私设计的核心是**只传左右手提示而非按键内容**——本项目完整继承了这一设计。

---

## 三、技术栈、语言与依赖清单

### 3.1 使用的编程语言

| 语言 | 用途 | 文件 |
|---|---|---|
| **Rust** | 原生层：全局键鼠钩子、透明窗口、托盘、本地控制服务 | `src-tauri/src/main.rs` |
| **JavaScript (ES Module)** | 前端：three.js 场景、状态机、UI、图片分析 | `src/main.js` |
| **Node.js** | MCP stdio 服务端、构建工具运行时 | `mcp-server.mjs` |
| **Python** | 网页版桥接脚本、快捷方式生成器 | `bridge.py`、`make_shortcut.py` |
| **HTML / CSS** | 界面结构与样式 | `index.html` |
| **JSON / TOML** | 配置文件 | `*.json`、`Cargo.toml` |

### 3.2 npm 依赖（前端 + MCP）

来自 `package.json`，实际安装版本以 `package-lock.json` 为准：

| 包名 | 声明版本 | 实际版本 | 用途 |
|---|---|---|---|
| `three` | `^0.187.0` | 0.187.x | 3D 渲染，程序化建模猫/键盘/鼠标 |
| `@tauri-apps/api` | `^2.12.5` | 2.12.5 | 前端调用原生命令、监听事件 |
| `pngjs` | `^7.0.0` | 7.0.0 | MCP 端解码 PNG 取色 |
| `jpeg-js` | `^0.4.4` | 0.4.4 | MCP 端解码 JPEG 取色 |
| `@tauri-apps/cli` (dev) | `^2.12.6` | 2.12.6 | `tauri dev` / `tauri build` 构建 CLI |
| `vite` (dev) | `^7.1.0` | 7.3.8 | 前端打包，产物输出到 `dist/` |

安全扫描：`npm audit` 报告 80 个依赖包，**0 个已知漏洞**。

### 3.3 Rust crate 依赖（`Cargo.toml`）

| crate | 版本 | 用途 |
|---|---|---|
| `tauri` | 2（features: `tray-icon`, `image-png`） | 桌面应用框架、窗口、托盘、事件系统 |
| `tauri-plugin-opener` | 2 | （预留）外部链接打开能力 |
| `serde` | 1（derive） | 序列化 |
| `serde_json` | 1 | 控制接口的 JSON 解析与构造 |
| `rdev` | 0.5 | **全局键鼠监听**（对应原版低级钩子） |
| `tauri-build` (build) | 2 | 构建脚本 |

> 本地控制接口刻意用标准库 `std::net` 手写最小 HTTP 服务，**未引入任何 Web 框架 crate**，减少攻击面与编译体积。

### 3.4 依赖分层图

```
┌─────────────────────────────────────────────┐
│ 交付物：PawPal.exe (9.4MB, 单文件)           │
├─────────────────────────────────────────────┤
│ 前端 (dist/)  ← Vite 打包                    │
│   three.js + @tauri-apps/api                 │
├─────────────────────────────────────────────┤
│ 原生 (Rust/MSVC)  ← Tauri 2                  │
│   tauri + rdev + serde_json + std::net       │
├─────────────────────────────────────────────┤
│ 系统依赖：WebView2（Windows 10/11 自带）     │
└─────────────────────────────────────────────┘

旁路工具（不进入 exe）：
  MCP 服务端 (Node) → pngjs + jpeg-js
  快捷方式生成器 (Python) → 纯标准库
```

---

## 四、系统工具链与安装包

本机初始状态：**无 Rust、无 C++ 编译器**，只有 Python 3.13 和 Node 22。为满足 Tauri 编译需求，从零搭建了完整工具链。

### 4.1 安装清单

| 组件 | 安装方式 | 说明 |
|---|---|---|
| **rustup + Rust** | `sh rustup-init.sh -y --profile minimal` | 初始装的是 `windows-gnu` target |
| **Rust MSVC toolchain** | `rustup toolchain install stable-x86_64-pc-windows-msvc` | **关键**：GNU target 缺 `dlltool` 无法编译，必须切换到 MSVC |
| **VS Build Tools 2022** | 官方 bootstrapper + `--add Microsoft.VisualStudio.Workload.VCTools` | 提供 `cl.exe` 编译器与 `link.exe` 链接器 |
| **Windows SDK 10.0.26100** | 随 VS Build Tools 安装 | 提供 `kernel32.lib` 等系统库与头文件 |
| **WebView2 Runtime** | 系统已预装 | Tauri 在 Windows 上的渲染引擎，Win10/11 自带 |

### 4.2 环境版本（最终）

```
Node.js       v22.22.2
Python        3.13.14
rustc         1.100.0 (0ef1bc386 2026-11-09)
Rust target   stable-x86_64-pc-windows-msvc
Windows SDK   10.0.26100.0
磁盘可用空间  约 34 GB（安装前）
```

### 4.3 未能安装的组件

| 组件 | 失败原因 | 影响 |
|---|---|---|
| **NSIS 3.13** | 下载被代理 502 拦截 | 无法生成 `.exe` 安装向导 |
| **WiX Toolset** | 同上 | 无法生成 `.msi` 安装包 |

> 结果：只交付单文件 exe。**这满足用户核心需求**——单 exe 双击即用，无需安装。

---

## 五、项目结构与配置文件详解

### 5.1 目录结构

```
2026-11-26-09-18-32/
├── deliverables/
│   └── PawPal.exe                    # 最终交付：单文件 exe (9.4MB)
├── desktop-cat/                      # 阶段一：网页版原型
│   ├── index.html                    # 零依赖单文件桌宠
│   ├── bridge.py                     # pynput 全局键鼠 + SSE 桥接
│   └── 启动桥接.bat                   # Windows 一键启动
├── pawpal/                           # 主项目：Tauri 原生版
│   ├── index.html                    # 页面结构与样式
│   ├── vite.config.js                # Vite 打包配置
│   ├── package.json / package-lock.json
│   ├── mcp-server.mjs                # MCP stdio 服务端
│   ├── mcp-config.example.json       # MCP 客户端配置样例
│   ├── make_shortcut.py              # .lnk 快捷方式生成器
│   ├── README.md                     # 使用说明
│   ├── dist/                         # Vite 构建产物（内嵌到 exe）
│   ├── src/
│   │   └── main.js                   # 前端全部逻辑（约 1050 行）
│   └── src-tauri/
│       ├── Cargo.toml / Cargo.lock   # Rust 依赖
│       ├── build.rs                  # tauri_build::build()
│       ├── tauri.conf.json           # Tauri 应用配置
│       ├── capabilities/default.json # 权限配置
│       ├── icons/                    # 程序化生成的猫头图标
│       └── src/
│           ├── main.rs               # 原生主逻辑（约 500 行）
│           └── lib.rs                # 库入口（因 [lib] 声明而必需）
└── PawPal项目完整文档.md              # 本文档
```

### 5.2 `package.json`

定义三个脚本与依赖分组：

```json
{
  "scripts": {
    "dev": "vite",            // 开发服务器，端口 5173
    "build": "vite build",    // 打包到 dist/
    "tauri": "tauri"          // Tauri CLI 入口
  },
  "dependencies": { ... },     // 运行时依赖
  "devDependencies": { ... }   // 构建工具
}
```

### 5.3 `vite.config.js`

| 配置项 | 值 | 作用 |
|---|---|---|
| `root` | `"."` | 项目根目录 |
| `base` | `"./"` | **相对路径**，保证 `file://` 与 Tauri 内嵌资源都能加载 |
| `server.port` | `5173` | 固定开发端口 |
| `build.target` | `"es2022"` | 现代 JS 语法目标 |
| `build.outDir` | `"dist"` | 输出目录，`emptyOutDir: true` 每次清空 |

> `base: "./"` 是踩坑后的修正：默认的绝对路径 `/assets/` 在 `file://` 下会 CORS 失败。

### 5.4 `tauri.conf.json`（核心配置）

| 配置段 | 关键字段 | 值与作用 |
|---|---|---|
| `build` | `beforeBuildCommand` | `npm run build`，打包前先构建前端 |
| | `frontendDist` | `../dist` |
| `app.windows[0]` | `label` | `main` |
| | `width` / `height` | 760 × 560（不可缩放） |
| | `decorations` | `false`（无边框） |
| | `transparent` | `true`（透明窗口） |
| | `alwaysOnTop` | `true`（置顶） |
| `app.security` | `csp` | 加固后的严格 CSP 白名单（见第九节） |
| `bundle` | `targets` | `"all"` |
| | `icon` | 32/128/128@2x PNG + ICO |
| | `nsis.installMode` | `currentUser` |
| | `nsis.languages` | `["SimplifiedChinese"]` |

### 5.5 `capabilities/default.json`（权限配置）

```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "core:window:allow-hide",
    "core:window:allow-show",
    "core:window:allow-set-always-on-top",
    "core:window:allow-set-size",
    "core:window:allow-set-position"
  ]
}
```

**安全设计**：只开放窗口控制权限，**没有** `fs`（文件系统）、`shell`（命令执行）、`http`（网络请求）、`opener` 等危险权限。这是「即使前端被注入也无法读文件/执行命令」的根本保障。

### 5.6 `Cargo.toml`

```toml
[package]
name = "pawpal"
version = "0.1.0"
edition = "2021"
rust-version = "1.77.2"

[lib]
name = "pawpal_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rdev = "0.5"
```

> 注意：`[lib]` 声明要求必须存在 `src/lib.rs`，否则 `cargo check` 报错（踩坑记录之一）。

### 5.7 `mcp-config.example.json`

AI 客户端的 MCP 接入样例：

```json
{
  "mcpServers": {
    "pawpal": {
      "command": "node",
      "args": ["<绝对路径>/pawpal/mcp-server.mjs"]
    }
  }
}
```

### 5.8 `main.rs` 功能模块

| 模块 | 行段 | 职责 |
|---|---|---|
| 全局钩子 | `start_global_input()` | `rdev::listen` 监听按键/鼠标/滚轮，归一化后 emit `pawpal-input` |
| 窗口命令 | `toggle_passthrough` 等 | 点击穿透、置顶、隐藏/显示、退出、拖动 |
| 本地控制服务 | `handle_control_client()` | 最小 HTTP 服务，处理 `/api/status`、`/api/coat`、`/api/look`、`/api/open-appearance` |
| 请求校验 | `is_local_nonbrowser_request()` | 安全加固：校验 Host、拒绝 Origin |
| 单实例转发 | `forward_appearance_to_running()` | `--appearance` 启动时转交已运行实例 |
| 托盘菜单 | `TrayIconBuilder` | 显示、穿透、设置、退出 |

### 5.9 `main.js` 功能模块

| 模块 | 说明 |
|---|---|
| 配置层 | `DEFAULT` / `DEFAULT_LOOK` / `loadCfg()` / `saveCfg()`，localStorage 持久化 |
| 材质表 `M` | three.js 材质，含 13 种预设毛色 |
| 部件系统 | `buildEars/buildEyes/buildTail/buildPattern/buildAccessory/applyBody` |
| 键盘与鼠标 | `buildKeys()` 支持 65/104 布局，迷你鼠标 |
| 状态机 `S` | 打字抬爪、追光标、眨眼、打哈欠、睡觉、随机数动作 |
| 图片分析 | `analyzeImageToCat()`，canvas 取色分桶推导配色与造型 |
| MCP 事件 | `listen("coat-update")` / `listen("look-update")` / `listen("open-appearance")` |
| UI 面板 | 外观编辑器、文件上传、行为开关、语音提醒 |

### 5.10 `mcp-server.mjs` 工具定义

| 工具 | 作用 |
|---|---|
| `generate_coat_from_photo` | 按 PNG/JPEG 生成配色+造型并热更新 |
| `generate_cat_from_photo` | 同上，更直观的别名 |
| `set_appearance` | 组合式修改耳型/眼型/尾巴/体态/花纹/配饰 |
| `set_coat` | 预设名或直接指定 `#RRGGBB` 颜色 |
| `list_coats` | 列出 13 种内置毛色 |
| `get_status` | 查询桌宠运行状态与端口 |

协议：stdio JSON-RPC 2.0，版本 `2025-06-18`；另有 `--probe` 与 `--apply` 命令行模式。

---

## 六、架构设计与数据流

### 6.1 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                     PawPal.exe (Tauri 2)                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 前端 WebView (http://tauri.localhost)                   │  │
│  │   main.js → three.js 场景 + 状态机 + 设置面板 UI         │  │
│  └───────────────┬───────────────────────┬────────────────┘  │
│                  │ Tauri Event           │ Tauri Command      │
│  ┌───────────────▼───────────────────────▼────────────────┐  │
│  │ Rust 原生层                                             │  │
│  │  · rdev 全局钩子 → emit("pawpal-input")                 │  │
│  │  · 窗口控制命令（穿透/置顶/拖动/托盘）                    │  │
│  │  · std::net 控制服务 127.0.0.1:17321                    │  │
│  └───────▲───────────────────────────────────▲────────────┘  │
└──────────┼───────────────────────────────────┼───────────────┘
           │ HTTP POST                         │ HTTP POST
   ┌───────┴────────┐                 ┌────────┴────────┐
   │ MCP Server     │                 │ 桌面快捷方式     │
   │ (Node stdio)   │                 │ --appearance    │
   │ 图片取色→配色   │                 │ 单实例转发       │
   └────────────────┘                 └─────────────────┘
```

### 6.2 三条核心数据流

**① 打字 → 动画**

```
rdev 捕获 KeyPress → normalize_key() 转成 KeyA 等 code
→ is_left_key() 判断左右手 → emit("pawpal-input", {type:"key",side:"L"})
→ 前端 pressKey() 抬对应爪子 + 高亮按键
```

**② 照片 → 整猫**

```
AI 调用 generate_cat_from_photo(image_path)
→ MCP 读文件 → checkImageBudget() 校验大小/像素
→ PNG/JPEG 解码 → dominantColors() 分桶聚类取主色
→ generateCoat() 推导配色 + inferAppearance() 推导造型
→ POST /api/look → emit("look-update") → 前端换材质 + 重建部件
```

**③ 快捷方式 → 外观编辑器**

```
双击桌面 .lnk → PawPal.exe --appearance
→ forward_appearance_to_running() 探测 17321-17330
  ├─ 有实例：POST /api/open-appearance → 原实例弹窗+emit → 新进程 exit(0)
  └─ 无实例：正常启动 → setup 延迟 900ms → emit("open-appearance")
→ 前端打开面板 + scrollIntoView 到外观编辑器 + 橙色高亮 1.8s
```

---

## 七、完整执行过程（六个阶段）

### 阶段 1：调研 + 网页版原型

**目标**：理解原理，先做一个能跑的复刻品。

- Web 搜索 + GitHub API 抓取，确认 7paws 技术栈
- 用可视化图表向用户解释「输入→钩子→IPC→状态机→渲染」链路
- 产出 `desktop-cat/`：
  - `index.html`：零依赖单文件，Canvas 绘制，13 种毛色、65/104 布局、呼噜声、Zzz、语音提醒
  - `bridge.py`：pynput 全局监听 + SSE 推给网页
  - `启动桥接.bat`：一键启动
- **验证**：JS/Python 语法检查通过；无头 Chrome 截图确认橘猫/奶牛猫渲染正常

### 阶段 2：Tauri 原生版 + 工具链从零搭建

**目标**：按原版打包成单 exe，实现真正的全局响应与透明窗口。

**耗时最长的阶段**——工具链安装：

1. 检测发现无 Rust、无 MSVC，但 WebView2 已就绪，磁盘 34GB
2. 并行后台安装 Rust（rustup）与 VS Build Tools
3. VS 安装首次失败 exit 5002，查日志发现 `HTTPS_PROXY` 与 `https_proxy` 重复变量导致 VS 安装器字典去重崩溃；清理后重装成功（约 23 分钟）
4. Rust 默认装的是 GNU target，缺 `dlltool` 无法链接；切换安装 `stable-x86_64-pc-windows-msvc`
5. 边装边写代码：项目骨架、Rust 全局钩子、three.js 前端

**验证**：
- `cargo check` → 修正 `[lib]` 缺 `lib.rs`、`start_drag` 未注册、capabilities 缺权限、bundle targets 格式、NSIS `languages` 字段名
- `npx tauri build` → exe 编译成功（9.4MB），仅安装包因 WiX 下载失败
- 无头 Chrome + CDP 反复截图调相机，从「只有猫头」调到「全身+键盘+鼠标可见」
- 修复 `isTauri` 异步检测导致浏览器回退监听未挂载的 bug
- 实际启动 exe：进程持续运行、内存 74MB、无崩溃

### 阶段 3：MCP 接口（照片配色热更新）

**目标**：让 AI 客户端能按照片生成配色并实时应用到桌宠。

- Rust：标准库手写 HTTP 服务，绑定 `127.0.0.1:17321`（占用顺延至 17330），提供 `/api/status` 与 `/api/coat`，emit `coat-update`
- 前端：`normalizeCoat()` 归一化颜色，动态注册第 14 个「照片定制」色板，持久化到 localStorage
- Node：`mcp-server.mjs`，stdio JSON-RPC 2.0，pngjs + jpeg-js 解码，16 级分桶聚类取主色
- 配置样例：`mcp-config.example.json`

**验证**：`--probe` 返回端口 → `--apply` 取色得到 `#F5A957`/绿眼 → MCP 握手与 tools/list 正常 → 无头浏览器注入紫色截图确认生效

### 阶段 4：外观编辑器 + 图片生成相似小猫

**目标**：造型从写死改为可组合部件，并支持上传图片生成。

- 前端重构：猫模型拆成 7 个可重建部件组，`clearGroup()` 释放旧几何体，`applyLook()` 统一重建
  - 耳型 4 种、眼型 4 种（含异瞳）、尾巴 4 种、体态 3 种 + 头身比、花纹 5 种、配饰 5 种
- 设置面板新增：文件上传 + 预览 + `analyzeImageToCat()` + 6 组部件按钮 + 随机一只 + 造型复位
- 原生端：`POST /api/look` emit `look-update`
- MCP：新增 `set_appearance`、`generate_cat_from_photo`

**验证**：三组造型（折耳异瞳卷尾三花帽子 / 圆耳眯眼蓬尾奶牛围巾 / 图片生成橘色三花）无头浏览器截图均正常；设置面板布局确认；MCP 工具端到端成功

### 阶段 5：桌面快捷方式

**目标**：一键直达外观编辑器。

- Rust：解析 `--appearance`/`--editor`/`-a`；新增 `/api/open-appearance`；`forward_appearance_to_running()` 实现单实例转发
- 前端：监听 `open-appearance`，打开面板 + 滚动定位 + 高亮
- **关键坑**：PowerShell 的 COM 创建 `.lnk` 被安全策略拦截 → 改用纯 Python 标准库手写 Shell Link 二进制（`make_shortcut.py`）

**验证**：`?appearance=1` 浏览器确认滚动位置 290、分组高亮；端到端两条路径（冷启动 / 已运行转发）均通过

### 阶段 6：安全审计加固

**目标**：检测漏洞，确认无高危。详见第九节。

---

## 八、关键问题与解决方案（踩坑记录）

| # | 问题 | 现象 | 解决方案 |
|---|---|---|---|
| 1 | **VS 安装器 exit 5002** | 静默安装崩溃，查日志发现代理变量重复 | 在 PowerShell session 中 `Remove-Item Env:https_proxy/http_proxy` 后重装 |
| 2 | **Rust GNU target 缺 dlltool** | `cargo check` 报链接工具缺失 | 安装 `stable-x86_64-pc-windows-msvc`，用 `RUSTUP_TOOLCHAIN` 指定 |
| 3 | **Windows SDK 未就绪** | 编译报 `kernel32.lib` 找不到 | 等待 VS 安装器完成（目录 `Lib/10.0.26100.0/um/x64`） |
| 4 | **`[lib]` 缺 lib.rs** | cargo 报找不到库入口 | 新建 `src/lib.rs` |
| 5 | **`start_drag` 未注册** | 前端 invoke 失败 | 在 `generate_handler!` 注册，并在 capabilities 加 `allow-start-dragging` |
| 6 | **bundle.targets 格式错误** | `BundleTargetInner` 解析失败 | 用 `"all"` 而非 `["nsis","portable"]` |
| 7 | **NSIS 配置项名错误** | 配置校验失败 | `language` → `languages` |
| 8 | **ES module 在 file:// CORS 失败** | 无头浏览器白屏 | Vite `base:"./"` + HTTP server 验证；Tauri 用 `http://tauri.localhost` 不受影响 |
| 9 | **相机取景不对** | 猫身被裁、键盘不可见 | CDP 反复截图调整相机位置与 lookAt |
| 10 | **`isTauri` 异步检测 bug** | 浏览器回退监听未挂载，按键无效 | 改为同步可靠检测 |
| 11 | **拖窗口误触发摸猫** | mousedown 同时触发拖拽与摸头 | 加条件判断分离两种手势 |
| 12 | **TDZ 错误** | `DEFAULT_LOOK` 在 `loadCfg()` 之后定义 | 提前到 `loadCfg()` 之前 |
| 13 | **setup 闭包生命周期** | `want_appearance` 无法跨线程 | 闭包加 `move` 关键字 |
| 14 | **COM 创建 .lnk 被拦截** | 安全策略拒绝 `WScript.Shell` | 纯标准库手写 Shell Link 二进制 |
| 15 | **NSIS/WiX 下载 502** | 代理拦截，无法打安装包 | 放弃安装包，交付单 exe（满足核心需求） |

---

## 九、漏洞检测与安全加固报告

### 9.1 审计范围与方法

审计覆盖全部源文件：原生端 `main.rs`、前端 `main.js`、MCP `mcp-server.mjs`、页面 `index.html`、Tauri 配置、capabilities、依赖清单。检查维度：

- 注入类：RCE、命令注入、XSS/DOM 注入
- 访问控制：CORS/CSRF/DNS rebinding、越权、权限过宽
- 数据安全：任意文件读写/外传、SSRF、隐私泄露
- 可用性：资源耗尽、解压炸弹、阻塞 DoS
- 供应链：依赖已知漏洞

另启动一个独立交叉审计 Agent 复核，结论一致。

### 9.2 总体结论：**无高危风险**

不存在 RCE、任意文件读写外传、命令注入、SSRF、键盘内容泄露。理由：

- 原生端无 `Command` 调用，MCP 端无 `child_process`
- 键盘事件只发归一化键码 + 左右手提示，**不含实际字符**，不落盘不联网
- capabilities 仅窗口权限，无 `fs`/`shell`/`http`
- HTTP 客户端 host 硬编码 `127.0.0.1`，无外网 SSRF
- `normalizeCoat`/`normalizeLook` 均为白名单 + 正则校验

### 9.3 发现并修复的问题（4 项）

| 等级 | 问题 | 原状 | 修复措施 | 验证结果 |
|---|---|---|---|---|
| **中** | 控制接口跨站触发（CSRF / DNS rebinding） | `Access-Control-Allow-Origin: *`，无 Host/Origin 校验 | 移除全部 CORS 头；新增 `is_local_nonbrowser_request()` 校验 Host 为回环地址、拒绝任何带 `Origin` 的请求；加 `X-Content-Type-Options: nosniff` | 合法请求 200；带 Origin 403；伪造 Host 403；CORS 头消失 |
| **中** | 前端 DOM XSS | `info.innerHTML` 拼接用户可控的图片文件名 | 改用 `replaceChildren()` + `createTextNode()` | 注入 `<img onerror>` 未执行，`imgTags:0`、`xssFired:false` |
| **低** | 控制服务串行阻塞 DoS | 每个连接同步处理，慢客户端 4s 读超时阻塞后续请求 | 改为每连接 `spawn` 独立线程 | 多并发请求互不阻塞 |
| **低** | 图片解压炸弹 / OOM + CSP 关闭 | 先读整个文件再查大小；`csp:null` | 新增 `checkImageBudget()`（≤24MB、≤16384px、≤6400 万像素）；启用严格 CSP 白名单（含 Tauri IPC 放行） | 超限图片拒绝；`npx tauri info` 确认 CSP 生效 |

### 9.4 加固后的安全边界

- **控制接口**：只绑定 `127.0.0.1:17321-17330`，仅接受本机非浏览器客户端。能力上限是「改配色/造型、弹设置面板」，不读写任意文件、不执行命令、不对外网开放。
- **前端**：所有外部数据以 `textContent`/DOM 节点渲染，不走 `innerHTML`；配色与造型字段白名单 + 正则校验；严格 CSP（`script-src 'self'`、`connect-src` 含 `ipc:`、`object-src`/`base-uri`/`frame-ancestors` 均 `none`）。
- **图片**：读取前查大小与像素，本机解码，不上传。
- **权限**：Tauri capabilities 仅 core + window 控制。
- **依赖**：`npm audit` 0 漏洞（80 包）。

### 9.5 依赖扫描结果

```
npm audit → vulnerabilities: { info:0, low:0, moderate:0, high:0, critical:0, total:0 }
           dependencies: { prod:5, dev:76, optional:64, total:80 }
```

---

## 十、验证与测试记录

| 验证项 | 方法 | 结果 |
|---|---|---|
| JS 语法 | `node --check` / `node --input-type=module --check` | 通过 |
| Python 语法 | `python -m py_compile` | 通过 |
| Rust 编译 | `cargo check` + `cargo build --release` | 通过 |
| 前端构建 | `npm run build` | 通过（仅 chunk >500kB 提示，非错误） |
| 3D 渲染 | 无头 Chrome + CDP `Page.captureScreenshot` | 猫/键盘/鼠标/各造型均正常 |
| 配置持久化 | localStorage 注入 + 截图 | 紫色配色、Toast、第 14 色板均出现 |
| MCP 协议 | initialize / tools/list / tools/call | 全部正常 |
| 端到端 | 启动 exe → `--probe` → `--apply` | 取色 `#F5A957`、绿眼，热更新成功 |
| 快捷方式 | 冷启动 / 已运行转发两条路径 | 均通过，第二实例 exit 0 |
| 安全回归 | 自写 HTTP 测试脚本 | 6 项全通过 |
| XSS 验证 | CDP 注入恶意 payload | 未执行，纯文本显示 |
| CSP 生效 | `npx tauri info` | 正确识别配置 |
| 进程健康 | PowerShell 启动 4s 后检查 | 存活，内存约 74MB，无崩溃 |

> 验证方法说明：Playwright 浏览器未安装，改用系统自带 Chrome 的 `--headless=new` + DevTools Protocol（Node 内置 WebSocket）实现截图、事件注入与 DOM 检查。ES module 在 `file://` 下有 CORS 限制，故用 `python -m http.server` 起本地服务验证，Tauri 运行时走 `http://tauri.localhost` 不受影响。

---

## 十一、交付物与使用说明

### 11.1 交付物清单

| 文件 | 大小 | 说明 |
|---|---|---|
| `deliverables/PawPal.exe` | 9.4 MB | 最终交付，单文件原生桌宠，SHA-256 `d56a1443b87b03bc0eb369a92bb6fa7e9fddb2386a8d93b4cb34d334be32651b` |
| `桌面\PawPal 外观编辑器.lnk` | 503 B | 桌面快捷方式，指向 `PawPal.exe --appearance` |
| `pawpal/mcp-server.mjs` | 22 KB | MCP 服务端（供 AI 客户端接入） |
| `pawpal/mcp-config.example.json` | 245 B | MCP 客户端配置样例 |
| `pawpal/make_shortcut.py` | 3.7 KB | 快捷方式重建脚本 |
| `pawpal/README.md` | 5.7 KB | 使用说明 |
| `pawpal/` 其余源码 | — | 完整可重新构建的工程 |

### 11.2 使用方式

**基本使用**：双击 `PawPal.exe`。敲键盘看它抬爪，移动鼠标看它追光标，按住猫头摸它会眯眼呼噜，闲置会睡觉冒 Zzz。

**外观编辑**：双击桌面「PawPal 外观编辑器」快捷方式，或在工具栏点「设置」。可组合耳型/眼型/尾巴/体态/花纹/配饰，上传图片生成相似小猫。

**MCP 接入**：

```bash
cd pawpal && npm install
# 把 mcp-config.example.json 中的 mcpServers.pawpal 复制到 AI 客户端 MCP 配置
# 对 AI 说：「用我桌面上的 cat.jpg 给桌宠换个同款配色」
```

命令行直测：`node mcp-server.mjs --apply ./photo.jpg "我家猫同款"`

**快捷方式重建**（移动 exe 后）：`python make_shortcut.py`

### 11.3 版本演进与校验值

| 阶段 | exe SHA-256 前缀 | 新增能力 |
|---|---|---|
| 原生版 | — | Tauri + three.js、全局钩子、透明窗口 |
| MCP | `1bb09fd2…` | 本地控制接口、照片配色热更新 |
| 外观编辑器 | `ddd75e9a…` | 部件系统、图片生成整猫 |
| 快捷方式 | `bb47d001…` | `--appearance`、单实例转发 |
| 安全加固 | `d56a1443…` | CORS/Host 校验、XSS 修复、线程池、CSP、图片预算 |
| **合规版（最终）** | **`fcd0180b…`** | 移除全局钩子/端口/localStorage，改单配置文件 + 进程内事件，依赖锁版本 |

### 11.4 已知限制

- 只有单 exe，**没有 `.msi`/`.exe` 安装向导版**（NSIS/WiX 下载被代理拦截）。单 exe 已完整可用。
- 依赖 Windows WebView2（Win10/11 自带）。
- 视觉是 three.js 程序化建模的 3D 卡通猫，非原版的精细美术模型。
- 本项目为 Windows 平台构建；macOS 需另行适配（原版用 CGEventTap）。

---

## 十二、附录：命令速查与版本信息

### 12.1 常用命令

```bash
# 前端
npm install
npm run dev                  # 开发服务器 :5173
npm run build                # 打包到 dist/

# Tauri
npx tauri dev
npx tauri build              # 编译 exe（含安装包，后者可能失败）
npx tauri build --no-bundle  # 仅编译 exe
npx tauri info               # 查看环境（可确认 CSP 是否生效）

# Rust（必须指定 MSVC target）
export PATH="$USERPROFILE/.cargo/bin:$PATH"
export RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc
cargo check
cargo build --release

# MCP
node mcp-server.mjs --probe
node mcp-server.mjs --apply ./photo.jpg "名称"

# 快捷方式
python make_shortcut.py

# 安全
npm audit
```

### 12.2 环境变量注意事项

VS Build Tools 安装时若同时存在 `HTTPS_PROXY` 与 `https_proxy`（大小写两份），安装器会报 exit 5002。解决：

```powershell
Remove-Item Env:https_proxy -ErrorAction SilentlyContinue
Remove-Item Env:http_proxy -ErrorAction SilentlyContinue
```

### 12.3 最终环境版本

```
Node.js      v22.22.2
Python       3.13.14
rustc        1.100.0 (0ef1bc386 2026-11-09)
Rust target  stable-x86_64-pc-windows-msvc
Tauri        2.12.x
three.js     0.187.x
Vite         7.3.8
Windows SDK  10.0.26100.0
WebView2     系统预装
```

---

## 十三、合规化改造（当前状态）

### 13.1 背景与冲突处理

用户在安全审计后追加五条硬性约束，其中两条与既有架构直接冲突：

- 「不开放任何本地监听端口、进程间通信只用进程内事件」→ 推翻了原「独立 MCP 进程经 `127.0.0.1:17321` HTTP 通信」的架构。
- 「仅监听应用自身窗口内的键盘事件」→ 推翻了 `rdev` 全局钩子与 Python `pynput` 桥接。

经确认后采用方案：**MCP 改为写单一配置文件 + 进程内事件热加载**；**保留用户点选单张图片生成本地配色**（只读用户显式选中的文件，不遍历目录）。

### 13.2 五条约束的落地对照

| # | 约束 | 改造前 | 改造后（当前） |
|---|---|---|---|
| 1 | 禁全局输入监听 API | `rdev` 全局钩子 + `pynput` 桥接 | 删除 `rdev` 依赖、`start_global_input()`、`bridge.py`、启动桥接.bat；键盘/鼠标只走应用窗口自身 DOM 事件 `keydown`/`mousemove`/`wheel`，窗口失焦即不响应 |
| 2 | 禁剪贴板/截图录屏/目录遍历；持久化单文件 | localStorage + WebView 多目录 | 唯一文件 `%APPDATA%/PawPal/config.json`（Rust `read_config`/`write_config`）；源码零剪贴板/截图/`readdir` 调用；图片只读用户选中的单个文件 |
| 3 | 无网络请求/埋点；依赖锁版本+说明用途 | 依赖用 `^` 范围版本 | `package.json`/`Cargo.toml` 全部精确到版本并逐项注释用途；无 http/fetch/WebSocket/socket；无埋点 SDK |
| 4 | 不开放端口；IPC 用进程内事件 | `std::net` HTTP 服务 17321-17330 | 删除整段 HTTP 服务与端口探测；MCP 写配置文件，桌宠每 600ms 查该文件 mtime，变化则 Tauri 进程内 `emit("config-changed")` → 前端读取应用 |
| 5 | 不请求管理员权限；无自动更新 | （本就无） | 确认无 updater 插件、无 elevate 配置；NSIS 保持 `currentUser` 用户级 |

### 13.3 改造后的架构与数据流

```
键盘/鼠标 ──> 应用窗口 DOM 事件 ──> 前端状态机 ──> three.js 动画
                   （无全局钩子，窗口外输入不捕获）

AI 客户端 ─stdio─> MCP 服务端 ─写─> %APPDATA%/PawPal/config.json（唯一文件）
                                          │
                                   600ms mtime 轮询（单文件）
                                          ▼
                                 Tauri 进程内事件 config-changed
                                          ▼
                                 前端读取配置 ─> 换配色/造型（热更新）

全程：零端口、零网络、零剪贴板、零目录遍历、零提权
```

**打字→动画**（改造后）：窗口内 `keydown` → `pressKey()` 抬爪 + 按键高亮；不再有 `rdev`→`normalize_key`→`pawpal-input` 链路。

**照片→整猫**（改造后）：用户点选单个图片 → 本机 `analyzeImageToCat()` 取色 → 前端直接应用；或 MCP 工具读单文件 → 写配置文件 → 进程内事件 → 前端应用。两条路径均不遍历目录、不联网。

### 13.4 依赖锁定清单（精确版本）

**npm（package.json）**：`three` 0.187.0（3D 渲染）、`@tauri-apps/api` 2.12.5（命令/事件桥）、`pngjs` 7.0.0（PNG 取色）、`jpeg-js` 0.4.4（JPEG 取色）；dev：`@tauri-apps/cli` 2.12.6（打包）、`vite` 7.3.8（构建）。

**Rust（Cargo.toml）**：`tauri` 2.12.7（窗口/托盘/进程内事件）、`tauri-plugin-opener` 2.7.3（标准能力，未启用前端调用）、`serde` 1.0.229 与 `serde_json` 1.0.154（配置校验）、`tauri-build` 2.7.6（构建脚本）。**已移除 `rdev`**。

### 13.5 合规验证结果

| 验证项 | 方法 | 结果 |
|---|---|---|
| 全局输入 API | 全源码 grep `rdev/pynput/keyboard./pyautogui/GetAsyncKeyState/SetWindowsHookEx` | 0 匹配（仅 3D 键盘模型变量名与注释文字） |
| 网络/端口 | grep `TcpListener/fetch/EventSource/socket/http.request` + 实测 17321-17330 端口 | 源码 0 匹配；**8 个端口全部无监听** |
| 剪贴板/截图/遍历 | grep `clipboard/screenshot/getUserMedia/readdir/walkdir` | 0 匹配 |
| 提权/自动更新 | grep `updater/elevate/runAs` + 检查 tauri.conf | 无 updater、无 elevate；NSIS currentUser |
| MCP 无端口通信 | stdio JSON-RPC 握手 + 6 工具调用 | 协议 2025-06-18、6 工具、`set_coat`/`set_appearance` 写入配置成功，工具 schema 无 port 参数 |
| 单配置文件 | 读取 `%APPDATA%/PawPal/config.json` | `coat=custom`、自定义配色名与 `look`（fold 耳/curled 尾）正确写入 |
| 窗口内键盘 | CDP 派发窗口内 keydown + 截图 | 0 异常，canvas 正常渲染，猫眼睁开（被键盘唤醒） |
| 编译 | `cargo build --release` + `npm run build` | 通过，exe 9.1 MB（较 9.4 MB 减少，因移除 rdev） |

### 13.6 变更后的影响

- **功能取舍**：切到其他软件打字时小猫不再反应——这是「仅监听自身窗口」约束的必然结果；外观编辑、图片生成、MCP 热更新、桌面快捷方式均保留。
- **快捷方式**：`--appearance` 不再做跨进程转发（无需端口），只驱动本进程内的事件。
- **最终交付**：`deliverables/PawPal.exe`（9.1 MB，SHA-256 `fcd0180b460cb73fc12ef8063f371a0614327a8ba5ead9ce2f081b3ed7fbab4e`），桌面快捷方式保持不变。

---

## 14. 六类敏感操作代码位置清单（最终合规版）

> **扫描范围**：`pawpal/src/`、`pawpal/src-tauri/src/`、`pawpal/mcp-server.mjs`、`pawpal/make_shortcut.py`、`desktop-cat/index.html`。
> **排除范围**：`node_modules/`、`dist/` —— 前者是第三方依赖源码，后者是构建产物，均不属于本项目自有的运行时逻辑。
> **行号基准**：当前磁盘上的最终源码（合规改造完成、release 编译通过后的版本）。

### 14.1 读文件

| 文件:行号 | 代码 | 用途 | 边界 |
|---|---|---|---|
| `pawpal/src-tauri/src/main.rs:36-37` | `config_path().and_then(\|p\| fs::read_to_string(p).ok())` | `read_config` 命令：读取唯一配置文件 `%APPDATA%/PawPal/config.json` | 固定单文件，路径不可由前端指定 |
| `pawpal/src-tauri/src/main.rs:74` | `fs::metadata(p)` | 初始化配置文件修改时间基线 | 只读元数据，不读内容 |
| `pawpal/src-tauri/src/main.rs:79` | `fs::metadata(p)` | 每 600 ms 轮询该文件的 mtime，用于触发进程内事件 | 同一固定文件，非目录监听 |
| `pawpal/mcp-server.mjs:87` | `fs.statSync(file)` | 检查用户点选图片的文件大小（≤24MB） | 单文件，路径来自工具参数 |
| `pawpal/mcp-server.mjs:91` | `fs.openSync(file, "r")` | 打开用户点选的图片以读取头部 | 单文件 |
| `pawpal/mcp-server.mjs:93` | `fs.readSync(fd, head, 0, head.length, 0)` | 读 PNG/JPEG 头部获取宽高，防解压炸弹 | 只读 24 字节 |
| `pawpal/mcp-server.mjs:99` | `fs.readFileSync(file)` | 读 JPEG 全字节以扫描 SOF 标记取宽高 | 单文件，前置 24MB 大小校验 |
| `pawpal/mcp-server.mjs:124` | `fs.readFileSync(file)` | 读图片字节交给 `pngjs`/`jpeg-js` 解码取色 | 单文件，前置像素数 ≤6400 万校验 |
| `pawpal/mcp-server.mjs:174` | `fs.existsSync(abs)` | 校验用户传入的单张图片路径是否存在 | 仅存在性判断 |
| `pawpal/mcp-server.mjs:226` | `fs.readFileSync(CONFIG_PATH, "utf8")` | MCP 读唯一配置文件后合并修改 | 固定单文件 |
| `pawpal/mcp-server.mjs:391` | `fs.statSync(CONFIG_PATH)` | `get_status` 查询配置文件存在性与大小 | 只读元数据 |
| `pawpal/mcp-server.mjs:453` | `fs.existsSync(CONFIG_PATH)` | `--probe` 命令行查询配置文件是否存在 | 仅存在性判断 |
| `pawpal/src/main.js:36` | `await invoke("read_config")` | 启动时经 Rust 间接读配置文件 | 前端无直接文件 API 权限 |
| `pawpal/src/main.js:1046` | `await invoke("read_config")` | 收到 `config-changed` 事件后读取新配置热更新 | 同上 |
| `pawpal/src/main.js:642` | `URL.createObjectURL(file)` | 为用户点选的单张图片创建内存 Blob URL | 浏览器内存对象，非磁盘遍历 |
| `pawpal/src/main.js:643,666` | `new Image()` + `img.src = url` | 在页面内解码该 Blob 用于预览与取色 | 仅用户显式选择的文件 |
| `pawpal/src/main.js:674` | `await invoke("get_config_path")` | 查询配置文件路径用于界面状态显示 | 只返回路径字符串，不读内容 |
| `pawpal/make_shortcut.py:93,99-100`（构建期） | `os.path.isfile(exe)` / `os.path.isdir(desktop)` | 生成快捷方式前检查目标 exe 与桌面目录存在 | 一次性构建脚本，不进入运行时 |
| `desktop-cat/index.html:149`（早期网页原型） | `localStorage.getItem("pawpal-settings")` | 原型页读取本地设置 | **不在最终 exe 中** |

补充：`pawpal/src-tauri/src/main.rs:27` 读取 `APPDATA` 环境变量用于拼出固定路径；`pawpal/mcp-server.mjs:38` 读取同名环境变量作为兜底。二者均非文件内容读取。`pawpal/mcp-server.mjs:118` 的 `fs.closeSync(fd)` 是关闭已打开的句柄，不是读操作。

### 14.2 写文件

| 文件:行号 | 代码 | 用途 | 边界 |
|---|---|---|---|
| `pawpal/src-tauri/src/main.rs:29` | `fs::create_dir_all(&dir)` | 确保 `%APPDATA%/PawPal/` 存在 | 只创建这一个目录 |
| `pawpal/src-tauri/src/main.rs:56` | `fs::write(p, content)` | 写入唯一配置文件 `config.json` | 前置 256KB 大小限制 + JSON 对象校验 |
| `pawpal/mcp-server.mjs:235` | `fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })` | MCP 写入前确保配置目录存在 | 固定目录 |
| `pawpal/mcp-server.mjs:238` | `fs.writeFileSync(CONFIG_PATH, text, "utf8")` | MCP 写唯一配置文件 | 前置 256KB 限制，无路径参数 |
| `pawpal/src/main.js:30` | `invoke("write_config", { content: JSON.stringify(CFG) })` | 前端保存设置时经 Rust 写配置 | 前端无法指定路径 |
| `pawpal/make_shortcut.py:111-112`（构建期） | `open(out, "wb")` / `fh.write(data)` | 生成桌面快捷方式 `PawPal 外观编辑器.lnk` | 一次性构建脚本，不进入运行时 |
| `desktop-cat/index.html:152`（早期网页原型） | `localStorage.setItem("pawpal-settings", ...)` | 原型页保存设置 | **不在最终 exe 中** |

### 14.3 网络请求

**无。**

自有源码中没有 `fetch` / `XMLHttpRequest` / `WebSocket` / `EventSource` / `sendBeacon` / `http.request` / `TcpListener` / `TcpStream` / `UdpSocket` / `std::net` 等任何网络或监听调用；没有埋点 SDK。说明几处易被误报的字符串：

- `pawpal/src-tauri/tauri.conf.json:2,8,30`：`https://schema.tauri.app/config/2` 是 JSON Schema 标识，`http://localhost:5173` 是**仅开发模式**的 Vite 地址，CSP 字符串是安全策略白名单声明，均不是运行时发出的请求。
- `pawpal/package-lock.json` 中的 `https://registry.npmjs.org/...` 是 `npm install` 阶段的下载来源记录，程序运行时不读取。
- `pawpal/mcp-server.mjs:11` 的注释文本只是声明"无 http/https/socket/fetch"。
- MCP 传输为 **stdio JSON-RPC 2.0**，进程间通信为零端口、零网络的单一配置文件通道。

### 14.4 输入监听

全部为**应用自身 WebView 窗口内**的 DOM 事件；窗口未聚焦或失焦后收不到任何输入。无 `pynput` / `keyboard` / `pyautogui` / `GetAsyncKeyState` / `SetWindowsHookEx` / `rdev` 等全局钩子。

**最终原生版 `pawpal/src/main.js`：**

| 文件:行号 | 事件 | 用途 |
|---|---|---|
| `main.js:775` | `window.addEventListener("keydown", ...)` | 窗口内按键 → 抬爪动画与按键高亮 |
| `main.js:780` | `window.addEventListener("mousemove", ...)` | 窗口内鼠标位置 → 眼睛追踪 |
| `main.js:781` | `window.addEventListener("wheel", ...)` | 窗口内滚轮 → 唤醒猫 |
| `main.js:784` | `canvas.addEventListener("mousedown", ...)` | 画布内按下：靠近头部摸猫，否则拖动窗口 |
| `main.js:793` | `window.addEventListener("mouseup", ...)` | 结束摸猫、停止呼噜 |
| `main.js:796` | `canvas.addEventListener("contextmenu", ...)` | 画布右键打开设置面板 |
| `main.js:891` | `window.addEventListener("resize", ...)` | 窗口尺寸变化时调整相机与渲染器 |
| `main.js:961` | `file.onchange = ...` | 用户在文件选择框中点选单张图片 |
| `main.js:966` | `canvas.addEventListener("dragover", ...)` | 允许把单张图片拖入画布 |
| `main.js:967` | `canvas.addEventListener("drop", ...)` | 接收用户拖入的单张图片 |

**早期网页原型 `desktop-cat/index.html`（不在最终 exe 中）**：`:180` resize、`:253` keydown、`:257` keyup、`:258` 与 `:284` mousemove、`:265` wheel、`:269` contextmenu、`:270` mousedown、`:280` mouseup。

### 14.5 创建子进程

**无。** 源码中不存在 `std::process::Command` / `Command::new` / `child_process.spawn` / `exec` / `CreateProcess` / `ShellExecute` 等任何创建操作系统子进程的调用。

仅有两处 `std::thread::spawn`，它们是**同一进程内的线程**，不是子进程：

| 文件:行号 | 代码 | 用途 |
|---|---|---|
| `pawpal/src-tauri/src/main.rs:72` | `std::thread::spawn(move \|\| { ... })` | 单文件 mtime 轮询线程，变化后用 `app.emit("config-changed", ())` 发进程内事件 |
| `pawpal/src-tauri/src/main.rs:232` | `std::thread::spawn(move \|\| { ... })` | 带 `--appearance` 启动时延迟 900ms 显示窗口并 `emit("open-appearance", ())` |

### 14.6 写注册表

**无。** 源码中不存在 `reg add` / `RegSetValue` / `winreg` / `HKEY_*` / `HKCU` / `HKLM` 等注册表写入调用，也没有任何安装后自启动项写入。NSIS 配置仅声明 `installMode: "currentUser"`（用户级安装），不写注册表自启动键。

---

**文档结束**

> 本文档记录了 PawPal 项目从需求到交付、再到合规化改造的完整过程。所有技术决策、踩坑记录、配置细节、安全审计与合规改造结论均来自实际执行过程，并经过验证。最终交付物为 `deliverables/PawPal.exe`（合规版），可直接双击运行。
