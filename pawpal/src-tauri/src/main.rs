#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! PawPal — 合规版原生桌宠
//!
//! 合规约束（与需求逐条对应）：
//!  1. 键盘跟随：用户已授权放宽「仅监听自身窗口」，使用 rdev（Windows 低级键盘钩子
//!     WH_KEYBOARD_LL）做全局键盘跟随；只提取左右手与键位标识，不记录输入文本、不联网。
//!     本窗口聚焦时跳过全局事件，交给窗口内 DOM 事件，避免重复。
//!  2. 不读剪贴板、不截图录屏、不遍历目录；持久化只写一个文件
//!     %APPDATA%/PawPal/config.json。
//!  3. 无网络请求、无埋点 SDK；无监听器端口；跨进程只通过「单一配置文件 + 进程内事件」。
//!  4. 不请求管理员权限，无自动更新逻辑。

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize,
};

static ALWAYS_TOP: AtomicBool = AtomicBool::new(true);
static GLOBAL_KEYS: AtomicBool = AtomicBool::new(true);
const LEFT_KEYS: &str = "`12345qwertasdfgzxcvb";

/// 把 rdev 的按键转成 (键位 code, 左右手, 显示标签)；只处理可显示字符键，修饰键忽略。
fn map_global_key(key: rdev::Key) -> Option<(&'static str, &'static str, &'static str)> {
    use rdev::Key::*;
    let (code, label) = match key {
        KeyA => ("KeyA", "a"), KeyB => ("KeyB", "b"), KeyC => ("KeyC", "c"),
        KeyD => ("KeyD", "d"), KeyE => ("KeyE", "e"), KeyF => ("KeyF", "f"),
        KeyG => ("KeyG", "g"), KeyH => ("KeyH", "h"), KeyI => ("KeyI", "i"),
        KeyJ => ("KeyJ", "j"), KeyK => ("KeyK", "k"), KeyL => ("KeyL", "l"),
        KeyM => ("KeyM", "m"), KeyN => ("KeyN", "n"), KeyO => ("KeyO", "o"),
        KeyP => ("KeyP", "p"), KeyQ => ("KeyQ", "q"), KeyR => ("KeyR", "r"),
        KeyS => ("KeyS", "s"), KeyT => ("KeyT", "t"), KeyU => ("KeyU", "u"),
        KeyV => ("KeyV", "v"), KeyW => ("KeyW", "w"), KeyX => ("KeyX", "x"),
        KeyY => ("KeyY", "y"), KeyZ => ("KeyZ", "z"),
        Num0 => ("Digit0", "0"), Num1 => ("Digit1", "1"), Num2 => ("Digit2", "2"),
        Num3 => ("Digit3", "3"), Num4 => ("Digit4", "4"), Num5 => ("Digit5", "5"),
        Num6 => ("Digit6", "6"), Num7 => ("Digit7", "7"), Num8 => ("Digit8", "8"),
        Num9 => ("Digit9", "9"),
        BackQuote => ("Backquote", "`"), Minus => ("Minus", "-"), Equal => ("Equal", "="),
        LeftBracket => ("BracketLeft", "["), RightBracket => ("BracketRight", "]"),
        BackSlash => ("Backslash", "\\"), SemiColon => ("Semicolon", ";"),
        Quote => ("Quote", "'"), Comma => ("Comma", ","), Dot => ("Period", "."),
        Slash => ("Slash", "/"), Space => ("Space", " "),
        Return => ("Enter", "↵"), Tab => ("Tab", "⇥"), Backspace => ("Backspace", "⌫"),
        _ => return None,
    };
    let side = if LEFT_KEYS.contains(label) { "L" } else { "R" };
    Some((code, side, label))
}

/// 全局键盘跟随线程：rdev 回调在独立线程运行，通过进程内事件发给前端。
fn start_global_keys(app: AppHandle) {
    std::thread::spawn(move || {
        let listener_app = Arc::new(app);
        let _ = rdev::listen(move |event| {
            if !GLOBAL_KEYS.load(Ordering::SeqCst) {
                return;
            }
            if let rdev::EventType::KeyPress(key) = event.event_type {
                // 本窗口聚焦时，窗口内 DOM keydown 已处理，跳过避免重复弹字
                if listener_app
                    .get_webview_window("main")
                    .and_then(|w| w.is_focused().ok())
                    .unwrap_or(false)
                {
                    return;
                }
                if let Some((code, side, label)) = map_global_key(key) {
                    let _ = listener_app.emit(
                        "global-key",
                        serde_json::json!({ "code": code, "side": side, "label": label }),
                    );
                }
            }
        });
    });
}

#[tauri::command]
fn set_global_keys(enable: bool) -> bool {
    GLOBAL_KEYS.store(enable, Ordering::SeqCst);
    enable
}

#[tauri::command]
fn get_global_keys() -> bool {
    GLOBAL_KEYS.load(Ordering::SeqCst)
}

/// 唯一的持久化文件：%APPDATA%/PawPal/config.json
fn config_path() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    let dir = PathBuf::from(appdata).join("PawPal");
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("config.json"))
}

/// 读取配置文件；不存在则返回空字符串（前端用默认配置）
#[tauri::command]
fn read_config() -> String {
    config_path()
        .and_then(|p| fs::read_to_string(p).ok())
        .unwrap_or_default()
}

/// 写入唯一配置文件，返回是否成功
#[tauri::command]
fn write_config(content: String) -> bool {
    // 只接受纯 JSON 对象，且限制大小，避免写入任意内容
    if content.len() > 256 * 1024 {
        return false;
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
        if !v.is_object() {
            return false;
        }
    } else {
        return false;
    }
    match config_path() {
        Some(p) => fs::write(p, content).is_ok(),
        None => false,
    }
}

/// 返回配置文件路径（仅用于界面展示，不暴露目录遍历能力）
#[tauri::command]
fn get_config_path() -> String {
    config_path()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// 当配置文件被外部（例如 MCP 进程）修改时，在应用进程内发出事件。
/// 这里用 std 的元数据时间戳轮询单个固定文件，不监听目录、不开放端口。
fn watch_config(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_modified = config_path()
            .and_then(|p| fs::metadata(p).ok())
            .and_then(|m| m.modified().ok());
        loop {
            std::thread::sleep(Duration::from_millis(600));
            let current = config_path()
                .and_then(|p| fs::metadata(p).ok())
                .and_then(|m| m.modified().ok());
            if current != last_modified {
                last_modified = current;
                let _ = app.emit("config-changed", ());
            }
        }
    });
}

/* ---------- 窗口控制（全部为进程内命令，无网络） ---------- */

/// 缩放宠物窗口：接收逻辑像素尺寸，限制范围并保持窗口中心不变。
/// 点击穿透功能已移除，窗口始终可接收鼠标事件。
#[tauri::command]
fn set_pet_size(app: AppHandle, width: u32, height: u32) -> bool {
    let w = width.clamp(420, 1200);
    let h = height.clamp(320, 900);
    let Some(win) = app.get_webview_window("main") else {
        return false;
    };
    let Ok(size) = win.inner_size() else {
        return false;
    };
    let Ok(pos) = win.outer_position() else {
        return false;
    };
    let scale = win.scale_factor().unwrap_or(1.0);
    let physical = PhysicalSize::new(
        (w as f64 * scale).round() as u32,
        (h as f64 * scale).round() as u32,
    );
    let center_x = pos.x + size.width as i32 / 2;
    let center_y = pos.y + size.height as i32 / 2;
    let _ = win.set_position(PhysicalPosition::new(
        center_x - physical.width as i32 / 2,
        center_y - physical.height as i32 / 2,
    ));
    let _ = win.set_size(physical);
    true
}

#[tauri::command]
fn set_topmost(app: AppHandle, enable: bool) -> bool {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_always_on_top(enable);
        ALWAYS_TOP.store(enable, Ordering::SeqCst);
    }
    enable
}

#[tauri::command]
fn get_topmost() -> bool {
    ALWAYS_TOP.load(Ordering::SeqCst)
}

#[tauri::command]
fn hide_cat(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

#[tauri::command]
fn show_cat(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[tauri::command]
fn quit_cat(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_settings(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.emit("open-settings", ());
    }
}

#[tauri::command]
fn start_drag(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.start_dragging();
    }
}

fn main() {
    // 命令行仅接受 --appearance / --editor / -a，用于快捷方式直达外观编辑器。
    // 不再有网络端口，也不做跨进程转发：每个实例只通过进程内事件驱动自身窗口。
    let want_appearance = std::env::args().skip(1).any(|a| {
        matches!(
            a.to_ascii_lowercase().as_str(),
            "--appearance" | "--editor" | "-a"
        )
    });

    tauri::Builder::default()
        .setup(move |app| {
            let handle = app.handle().clone();

            // 旧配置可能开启过点击穿透：启动时强制恢复鼠标可点击，保证按钮可用
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_ignore_cursor_events(false);
            }

            let show = MenuItem::with_id(app, "show", "显示小猫", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &settings, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "settings" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                            let _ = w.emit("open-settings", ());
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let visible = w.is_visible().unwrap_or(false);
                            if visible {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // 配置文件变化 → 进程内事件（供前端热加载 MCP 写入的配色/造型）
            watch_config(handle.clone());

            // 全局键盘跟随 → 进程内事件（用户授权放宽；只传键位标识，不记录文本）
            start_global_keys(handle.clone());

            // 快捷方式带 --appearance：等前端订阅好后，用进程内事件打开编辑器
            if want_appearance {
                let h = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(900));
                    if let Some(w) = h.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                    let _ = h.emit("open-appearance", ());
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_config,
            write_config,
            get_config_path,
            set_pet_size,
            set_global_keys,
            get_global_keys,
            set_topmost,
            get_topmost,
            hide_cat,
            show_cat,
            quit_cat,
            open_settings,
            start_drag
        ])
        .run(tauri::generate_context!())
        .expect("error while running PawPal");
}
