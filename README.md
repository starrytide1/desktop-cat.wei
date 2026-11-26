# PawPal · 打字小猫桌面宠物

一个基于 **Tauri 2 + Rust + three.js** 的 Windows 桌面宠物：根据应用窗口内的键盘输入抬爪打字，眼睛跟随窗口内鼠标，支持摸头呼噜、睡觉、语音提醒、可组合外观编辑器、照片生成配色，以及通过 MCP 热更新外观。

本仓库是最终**合规版**：无全局输入监听、无网络请求、无本地监听端口、无剪贴板/截图/目录遍历、无自动更新与提权，持久化仅写入 `%APPDATA%/PawPal/config.json` 一个文件。

## 目录结构

```
.
├── PawPal项目完整文档.md        # 完整技术文档（需求→实现→踩坑→审计→合规清单）
├── README.md                    # 本文件
├── desktop-cat/                 # 早期零依赖 Canvas 网页原型（非最终交付）
│   └── index.html
├── deliverables/
│   └── PawPal.exe               # 最终合规版单文件 exe（9.1 MB）
└── pawpal/                      # 正式 Tauri 项目
    ├── README.md                # 详细使用、构建与合规说明
    ├── index.html               # 前端页面
    ├── src/main.js              # three.js 场景、状态机、外观编辑器、窗口内输入
    ├── mcp-server.mjs           # MCP stdio JSON-RPC 服务端（配置文件通道）
    ├── mcp-config.example.json  # MCP 客户端配置样例
    ├── make_shortcut.py         # 生成「外观编辑器」桌面快捷方式（构建期）
    ├── package.json / package-lock.json
    ├── vite.config.js
    ├── dist/                    # 已构建前端产物
    └── src-tauri/
        ├── src/main.rs          # 窗口控制、托盘、配置读写、进程内事件
        ├── src/lib.rs
        ├── Cargo.toml / Cargo.lock
        ├── tauri.conf.json
        ├── capabilities/default.json
        ├── icons/
        └── gen/schemas/         # Tauri 生成的配置 schema
```

## 快速开始

### 直接运行

下载 `deliverables/PawPal.exe` 双击即可运行。系统需要 **WebView2 Runtime**（Windows 11 自带，Windows 10 通常也已预装）。

- 右键托盘图标：显示/隐藏、切换点击穿透、设置、退出。
- 在猫头附近按下鼠标可摸猫；在猫身其他地方按下可拖动窗口。
- 窗口内右键打开设置面板；画布支持拖入**单张** PNG/JPEG 图片生成同款小猫。
- 运行 `PawPal.exe --appearance` 可直接打开外观编辑器（桌面快捷方式即使用此参数）。

### 从源码构建

需要 Node.js 22+、Rust MSVC toolchain（`stable-x86_64-pc-windows-msvc`）、Visual Studio Build Tools（含 C++ 桌面开发与 Windows SDK）。

```bash
cd pawpal
npm ci
npm run build
npx tauri build
```

生成的 exe 位于 `pawpal/src-tauri/target/release/` 下。

需要重建桌面「外观编辑器」快捷方式时，另需构建期依赖 `pylnk3==0.4.3`（仅生成 `.lnk`，不进入运行时）：

```bash
python -m pip install pylnk3==0.4.3
python pawpal/make_shortcut.py
```

### MCP 接入

```bash
node pawpal/mcp-server.mjs --probe
node pawpal/mcp-server.mjs --apply <图片路径> [名称]
```

MCP 客户端配置见 `pawpal/mcp-config.example.json`。可用工具：`generate_coat_from_photo`、`generate_cat_from_photo`、`set_appearance`、`set_coat`、`list_coats`、`get_status`。全部通过 stdio JSON-RPC 2.0 通信，服务端写唯一配置文件，桌宠以进程内事件热更新。

## 安全与隐私边界

- **输入**：只监听应用自身 WebView 窗口内的键盘/鼠标 DOM 事件；窗口失焦后不接收任何输入。不使用 `pynput`、`keyboard`、`pyautogui`、`GetAsyncKeyState`、`SetWindowsHookEx`、`rdev`。
- **文件**：只读用户显式点选/拖入的单张图片；持久化只写 `%APPDATA%/PawPal/config.json`；不读剪贴板、不截图录屏、不遍历目录。
- **网络**：零网络请求、零埋点、零监听端口；MCP 为 stdio 传输。
- **权限**：不请求管理员权限、不含自动更新逻辑。
- **依赖**：npm 与 Cargo 依赖均锁定精确版本，用途见 `pawpal/README.md` 与项目完整文档第 13、14 章。

完整审计过程、漏洞修复记录与六类敏感操作的代码位置（文件:行号）清单见 [`PawPal项目完整文档.md`](./PawPal项目完整文档.md) 第 8、13、14 章。

## 许可

未指定开源许可证；如需使用或二次分发，请先与原作者确认。
