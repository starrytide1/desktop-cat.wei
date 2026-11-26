# PawPal · 原生 3D 打字小猫桌宠（合规版）

基于 **Tauri 2 + Rust + three.js** 的原生桌面宠物，实现思路对齐 GitHub 爆火的 `7wdn/7paws`。

> **特性说明**：不联网、不开放端口、不读剪贴板、不截图录屏、不遍历目录；所有数据只写入 `%APPDATA%/PawPal/config.json` 一个文件；不请求管理员权限、不含自动更新。**全局键盘跟随已按用户授权启用**（可在设置中关闭），只提取键位标识、不记录输入文本。详见下方「合规说明」。

## 功能

- **全局键盘跟随**：在 WPS / AI / 浏览器等任意程序打字，小猫都会跟着敲并弹出符号；可在设置中关闭（关闭后仅响应本窗口内按键）。只传键位标识，不记录输入内容
- **窗口内键鼠响应**：在本应用窗口内打字、移动鼠标、滚轮、点击，小猫都会实时反应
- **按键弹字 + 猫爪跟敲**：按键下沉/高亮并从键帽弹出所按符号，左右爪会落到对应键位跟着敲；停止输入后回到胸前
- **真 3D 小猫**：three.js 程序化建模，13 种毛色，眼睛追光标、眨眼、打哈欠、摇尾巴
- **外观编辑器**：耳型/眼型/尾巴/体态/花纹/配饰可自由组合，配饰颜色和头身比可调，支持「随机一只」
- **摸猫呼噜**：按住猫头闭眼享受（弯月眼 + 小舌头 + 腮红加深 + 爱心），WebAudio 合成呼噜声
- **睡觉**：闲置后闭眼冒 Zzz，可播放睡眠呼噜
- **键盘**：65% / 104 键布局，按键高亮 + 符号弹出 + 猫爪跟敲；隐私模式只弹圆点、不显示真实字符
- **原生窗口**：透明、置顶、可拖动身体、可缩放（工具栏 `－/＋`、设置滑块、`Ctrl/⌘ + 滚轮`，60%–160%）；**已取消点击穿透**，托盘图标左键显示/隐藏，右键菜单只剩显示/设置/退出
- **语音提醒**：定时用系统中文语音提醒
- **图片生成**：上传一张本地图片，本机分析主色生成相似小猫（只读用户选中的那一个文件）
- **MCP 接口**：AI 客户端通过单一配置文件驱动配色/造型热更新，无端口、无网络
- **本地持久化**：只写 `%APPDATA%/PawPal/config.json` 一个文件，无网络请求、无遥测

## 合规说明（逐条对应需求）

| 约束 | 实现方式 |
|---|---|
| 全局输入监听（原约束：禁用；**用户已授权放宽**） | 按用户选择，加入 `rdev = "=0.5.3"`（Windows 低级钩子 `WH_KEYBOARD_LL`）实现全局键盘跟随，可在设置「全局键盘跟随」开关。只向前端传键位 code + 左右手 + 显示标签，不采集/存储/上报输入文本、不联网；本窗口聚焦时跳过全局事件避免重复。未使用 pynput/keyboard/pyautogui 等，Python 桥接已移除 |
| 禁读剪贴板、禁截图录屏、禁遍历本地目录 | 源码零调用；图片只读取用户显式选中的单个文件，不递归扫描、不枚举目录 |
| 持久化只写 `%APPDATA%/<应用名>/` 单个配置文件 | 唯一文件为 `%APPDATA%/PawPal/config.json`，由 Rust `read_config`/`write_config` 管理，前端不再用 localStorage |
| 无网络请求、无第三方埋点 SDK | 无 http/fetch/WebSocket/socket；依赖仅 three.js、Tauri API、pngjs、jpeg-js（均本地用途） |
| 依赖清单锁定版本并说明用途 | `package.json`/`Cargo.toml` 全部精确到版本号，逐项用途见下文「依赖清单」 |
| 不开放本地监听端口、进程间通信只用进程内事件 | 已删除本地 HTTP 服务与端口；MCP 写配置文件，桌宠用「单文件时间戳轮询 → Tauri 进程内 emit」热更新 |
| 不请求管理员权限、无自动更新 | 无 updater 插件、无 elevate 配置；NSIS 为 currentUser 用户级安装 |

## 依赖清单（全部锁定版本）

### 前端运行时（package.json dependencies）

| 包 | 版本 | 用途 |
|---|---|---|
| `three` | 0.187.0 | three.js，程序化生成 3D 猫/键盘/鼠标与动画渲染 |
| `@tauri-apps/api` | 2.12.5 | 前端调用 Rust 命令（`invoke`）与监听进程内事件（`listen`） |
| `pngjs` | 7.0.0 | 本机解码 PNG 图片取色（仅读取用户选中的文件） |
| `jpeg-js` | 0.4.4 | 本机解码 JPEG 图片取色（同上） |

### 构建工具（devDependencies）

| 包 | 版本 | 用途 |
|---|---|---|
| `@tauri-apps/cli` | 2.12.6 | `tauri dev` / `tauri build` 打包桌面应用 |
| `vite` | 7.3.8 | 前端打包，产物输出到 `dist/` |

### Rust（Cargo.toml）

| crate | 版本 | 用途 |
|---|---|---|
| `tauri` | 2.12.7 | 桌面应用框架：窗口、托盘、进程内事件 |
| `tauri-plugin-opener` | 2.7.3 | Tauri 标准能力（前端未调用，仅占位；不产生网络请求） |
| `serde` | 1.0.229 | 配置 JSON 校验 |
| `serde_json` | 1.0.154 | 配置 JSON 解析与构造 |
| `tauri-build`（build） | 2.7.6 | 构建脚本，读取 `tauri.conf.json` |

> 已移除 `rdev`。系统级依赖为本机预装的 Rust MSVC 工具链、VS Build Tools + Windows SDK，以及 Windows 自带 WebView2。

## MCP：通过单一配置文件热更新（无端口、无网络）

桌宠启动后不监听任何端口。MCP 服务端把工具结果写入 `%APPDATA%/PawPal/config.json`；桌宠进程每 600ms 检查该文件的修改时间，变化时在**进程内**发出事件，前端随即读取并应用新配色/造型——全程无需重启、无网络、无端口。

### 1. 安装依赖

```bash
npm install
```

### 2. 在 AI 客户端里注册 MCP

把 `mcp-config.example.json` 里的 `mcpServers.pawpal` 段复制到客户端的 MCP 配置中（Claude Desktop 是 `%APPDATA%\Claude\claude_desktop_config.json`，Cursor / Cline 等通常是 `.mcp.json` 或设置页），并把 `args[0]` 改成 `mcp-server.mjs` 的实际绝对路径。重启客户端即可看到 `pawpal` 服务。

### 3. 可用工具

| 工具 | 作用 |
|---|---|
| `generate_coat_from_photo` / `generate_cat_from_photo` | 读一张本地图片，生成配色+造型并写入配置文件，桌宠进程内热更新 |
| `set_appearance` | 组合式修改耳型/眼型/尾巴/体态/花纹/配饰 |
| `set_coat` | 用预设名或 `#RRGGBB` 设置配色 |
| `list_coats` | 列出 13 种内置毛色 |
| `get_status` | 查询配置文件状态（不探测端口） |

也可以命令行直测：`node mcp-server.mjs --apply ./photo.jpg "我家猫同款"`。

## 桌面快捷方式

桌面上的 **「PawPal 外观编辑器」** 快捷方式指向 `PawPal.exe --appearance`，双击即打开设置面板并定位到外观编辑器（橙色高亮）。启动参数只驱动本进程内的事件，无跨进程转发、无端口。若移动了 exe，可运行 `python make_shortcut.py` 重建。

> 生成脚本需要构建期依赖 **pylnk3 0.4.3**（`python -m pip install pylnk3==0.4.3`），用于写出带 `LinkTargetIDList` 的标准 `.lnk`。早期纯标准库版本只写 LinkInfo，Windows Shell 会拒绝执行（双击无反应、提示“没有应用程序与此操作的指定文件有关联”），现已修复；未安装 pylnk3 时会回退到该旧实现并打印警告。pylnk3 仅在生成快捷方式时使用，不进入 exe、不参与运行时、不发起网络请求。

## 安全边界

- 输入只来自应用窗口自身的 DOM 事件，全局输入监听 API 一律不用。
- 所有外部数据（文件名、MCP 配色名）以 `textContent`/DOM 节点渲染，不走 `innerHTML`；配色/造型字段白名单 + 正则校验；启用严格 CSP。
- 图片读取前检查大小（≤24MB）与像素（≤6400 万），避免解压炸弹/OOM。
- Tauri capabilities 仅开放窗口控制，无文件系统/网络/命令执行权限；`withGlobalTauri: false`。
- 配置文件写入前校验为 JSON 对象且 ≤256KB，避免写入任意内容。

> 该桌宠的 MCP 能力上限只是「改配色/造型」。配置文件通道不对外、不联网。

## 已知限制

- 由于仅监听窗口内事件，切到其他软件打字时小猫不再反应（这是合规约束的必然结果）。
- 只有单文件 exe，无安装向导版（NSIS/WiX 工具链此前被代理拦截）。
- 依赖 Windows WebView2（Win10/11 自带）；本项目为 Windows 平台构建。
