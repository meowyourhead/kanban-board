#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod assets;
mod bridge;
mod images;
mod signing;
mod single_instance;
mod storage;
mod updater;
mod winstate;

use std::borrow::Cow;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use http::{header, Method, Request, Response, StatusCode};
use percent_encoding::percent_decode_str;
use tao::dpi::{LogicalSize, PhysicalPosition};
use tao::event::{Event, StartCause, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy};
use tao::window::{ResizeDirection, WindowBuilder};
use wry::{
    NewWindowResponse, PageLoadEvent, RequestAsyncResponder, WebContext, WebView, WebViewBuilder,
};
#[cfg(windows)]
use wry::WebViewBuilderExtWindows;

const PROTOCOL: &str = "kanban";
const SNAPSHOT_EVERY: Duration = Duration::from_secs(15 * 60);
/// The window appears when the page is ready, or after this long whatever happens.
const REVEAL_AFTER: Duration = Duration::from_millis(2500);
/// How long closing waits for the page to hand over its newest edit.
const FLUSH_WAIT: Duration = Duration::from_millis(1000);
/// How long closing waits for saves already on their way to disk.
const DRAIN_WAIT: Duration = Duration::from_secs(5);

enum UserEvent {
    Minimize,
    ToggleMaximize,
    PageLoaded,
    Close,
    Drag,
    Resize(ResizeDirection),
    /// The page's newest board (JSON text), or None when it has nothing unsaved.
    Flushed(Option<String>),
    /// A status for window.__kanbanUpdate.
    Update(String),
    /// An update is in place: save, start the new version and quit.
    Restart,
}

/// Work for the I/O thread, done strictly in order, so a slow disk never freezes the window.
enum Job {
    Request(Request<Vec<u8>>, RequestAsyncResponder),
    Snapshot,
    Barrier(Sender<()>),
}

static APP_DIR: OnceLock<PathBuf> = OnceLock::new();

/// The folder that holds the exe. While developing (debug build, or run from target\), the project folder.
fn app_dir() -> &'static Path {
    APP_DIR.get_or_init(|| {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf));
        match exe_dir {
            Some(dir) if !cfg!(debug_assertions) || dir.join("index.html").is_file() => dir,
            _ => PathBuf::from(env!("CARGO_MANIFEST_DIR")),
        }
    })
}

fn fallback_base() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| app_dir().to_path_buf())
}

#[cfg(windows)]
fn cursor_position() -> Option<(i32, i32)> {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

    let mut point = POINT { x: 0, y: 0 };
    if unsafe { GetCursorPos(&mut point) } != 0 {
        Some((point.x, point.y))
    } else {
        None
    }
}

#[cfg(not(windows))]
fn cursor_position() -> Option<(i32, i32)> {
    None
}

#[cfg(windows)]
fn restore_window(window: &tao::window::Window) {
    use tao::platform::windows::WindowExtWindows;
    use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_RESTORE};

    unsafe {
        ShowWindow(window.hwnd() as _, SW_RESTORE);
    }
}

#[cfg(not(windows))]
fn restore_window(_window: &tao::window::Window) {}

#[cfg(windows)]
fn set_resize_frame(window: &tao::window::Window, enabled: bool) {
    use tao::platform::windows::WindowExtWindows;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_THICKFRAME,
    };

    let hwnd = window.hwnd();
    let style = unsafe { GetWindowLongPtrW(hwnd as _, GWL_STYLE) } as u32;
    let has_frame = style & WS_THICKFRAME != 0;
    if has_frame == enabled {
        return;
    }
    let new_style = if enabled {
        style | WS_THICKFRAME
    } else {
        style & !WS_THICKFRAME
    };
    unsafe {
        SetWindowLongPtrW(hwnd as _, GWL_STYLE, new_style as isize);
        SetWindowPos(
            hwnd as _,
            std::ptr::null_mut(),
            0,
            0,
            0,
            0,
            SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }
}

#[cfg(not(windows))]
fn set_resize_frame(_window: &tao::window::Window, _enabled: bool) {}

fn log(message: &str) {
    let line = format!(
        "{} {}\n",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
        message
    );
    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(app_dir().join("kanban-rust.log"))
    {
        let _ = file.write_all(line.as_bytes());
    }
}

fn run_script(webview: &WebView, script: &str) {
    if let Err(err) = webview.evaluate_script(script) {
        log(&format!("could not run a page script: {}", err));
    }
}

fn sync_maximized(webview: &WebView, window: &tao::window::Window, maximized: bool) {
    set_resize_frame(window, !maximized);
    run_script(
        webview,
        if maximized {
            "document.documentElement.setAttribute('data-maximized', '1');"
        } else {
            "document.documentElement.setAttribute('data-maximized', '0');"
        },
    );
}

/// Dark themes start on a dark window, so there is no white flash before the first frame.
fn first_color(board: Option<&serde_json::Value>) -> (u8, u8, u8, u8) {
    match board.and_then(|b| b.get("theme")).and_then(|t| t.as_str()) {
        Some("cyberpunk" | "genshin" | "fallout" | "nier") => (18, 18, 22, 255),
        _ => (243, 243, 241, 255),
    }
}

fn main() {
    std::panic::set_hook(Box::new(|info| {
        log(&format!("panic: {}", info));
    }));

    let wait = if std::env::args().any(|a| a == updater::AFTER_UPDATE) {
        Duration::from_secs(20)
    } else {
        Duration::ZERO
    };
    if single_instance::another_instance_running(wait) {
        log("another instance is already running - exiting");
        return;
    }

    updater::clean_up();
    if let Err(err) = run() {
        log(&format!("fatal: {}", err));
    }
}

fn run() -> Result<(), String> {
    let app_dir = app_dir().to_path_buf();
    let fallback = fallback_base();
    let data_dir = storage::resolve_dir(&app_dir, &fallback);
    log(&format!(
        "starting: v{} app={} data={}",
        env!("CARGO_PKG_VERSION"),
        app_dir.display(),
        data_dir.display()
    ));

    let loaded = storage::load(&data_dir);
    match &loaded {
        Some(l) => log(&format!(
            "board loaded from {} ({} bytes)",
            l.from,
            l.json.len()
        )),
        None => log("no saved board yet"),
    }

    let script = bridge::init_script(
        &data_dir.to_string_lossy(),
        loaded.as_ref(),
        &updater::page_info(),
    );
    let background = first_color(loaded.as_ref().map(|l| &l.board));
    let last_json: Arc<Mutex<Option<String>>> =
        Arc::new(Mutex::new(loaded.as_ref().map(|l| l.json.clone())));
    drop(loaded);

    let state_path = app_dir.join("window-state.json");
    let saved_state = winstate::load(&state_path);

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy: EventLoopProxy<UserEvent> = event_loop.create_proxy();
    let proxy_load = proxy.clone();
    let proxy_flush = proxy.clone();
    let updater = Arc::new(updater::Updater::default());

    let mut builder = WindowBuilder::new()
        .with_title("Kanban")
        .with_decorations(false)
        .with_inner_size(LogicalSize::new(
            saved_state.width as f64,
            saved_state.height as f64,
        ))
        .with_min_inner_size(LogicalSize::new(720.0, 480.0))
        .with_visible(false);
    if let Ok(icon) = tao::window::Icon::from_rgba(
        include_bytes!("../build/icon-64.rgba").to_vec(),
        64,
        64,
    ) {
        builder = builder.with_window_icon(Some(icon));
    }
    if let (Some(x), Some(y)) = (saved_state.x, saved_state.y) {
        builder = builder.with_position(PhysicalPosition::new(x, y));
    }
    let window = builder
        .build(&event_loop)
        .map_err(|e| format!("could not create the window: {}", e))?;

    let mut web_data = app_dir.join("webview-data");
    if !storage::writable(&web_data) {
        web_data = fallback.join("webview-data");
        let _ = fs::create_dir_all(&web_data);
    }
    let mut context = WebContext::new(Some(web_data));

    let (jobs, inbox) = mpsc::channel::<Job>();
    let io_app = app_dir.clone();
    let io_data = data_dir.clone();
    let io_last = last_json.clone();
    std::thread::spawn(move || {
        for job in inbox {
            match job {
                Job::Request(request, responder) => {
                    responder.respond(handle_request(request, &io_app, &io_data, &io_last));
                }
                Job::Snapshot => {
                    let json = io_last.lock().ok().and_then(|guard| guard.clone());
                    if let Some(json) = json {
                        let result = storage::save(&io_data, &json, true);
                        log(&format!("periodic snapshot: ok={}", result.ok));
                    }
                }
                Job::Barrier(done) => {
                    let _ = done.send(());
                }
            }
        }
    });
    let protocol_jobs = Mutex::new(jobs.clone());
    let gpu_disabled = std::env::args_os().any(|arg| arg == "--no-gpu");

    let mut webview = WebViewBuilder::new_with_web_context(&mut context)
        .with_url(format!("{}://localhost/index.html", PROTOCOL))
        .with_initialization_script(script)
        .with_background_color(background)
        .with_asynchronous_custom_protocol(PROTOCOL.to_string(), move |_id, request, responder| {
            if let Some(response) = embedded(&request) {
                responder.respond(response);
                return;
            }
            let job = Job::Request(request, responder);
            if let Ok(jobs) = protocol_jobs.lock() {
                let _ = jobs.send(job);
            }
        })
        .with_navigation_handler(|url| {
            url.starts_with("kanban://")
                || url.starts_with("http://kanban.localhost")
                || url.starts_with("https://kanban.localhost")
                || url == "about:blank"
        })
        .with_new_window_req_handler(|_url, _features| NewWindowResponse::Deny)
        .with_ipc_handler(move |request| {
            let body = request.body().as_str();
            if body == "update:check" || body == "update:install" {
                let install = body == "update:install";
                let updater = updater.clone();
                let proxy = proxy.clone();
                std::thread::spawn(move || {
                    let progress = proxy.clone();
                    let outcome = if install {
                        updater.install(move |status| {
                            let _ = progress.send_event(UserEvent::Update(status));
                        })
                    } else {
                        updater.check()
                    };
                    let _ = proxy.send_event(match outcome {
                        updater::Outcome::Reply(status) => UserEvent::Update(status),
                        updater::Outcome::Restart => UserEvent::Restart,
                    });
                });
                return;
            }
            let event = match body {
                "window:minimize" => Some(UserEvent::Minimize),
                "window:maximize" => Some(UserEvent::ToggleMaximize),
                "window:close" => Some(UserEvent::Close),
                "window:drag" => Some(UserEvent::Drag),
                "window:resize:n" => Some(UserEvent::Resize(ResizeDirection::North)),
                "window:resize:ne" => Some(UserEvent::Resize(ResizeDirection::NorthEast)),
                "window:resize:e" => Some(UserEvent::Resize(ResizeDirection::East)),
                "window:resize:se" => Some(UserEvent::Resize(ResizeDirection::SouthEast)),
                "window:resize:s" => Some(UserEvent::Resize(ResizeDirection::South)),
                "window:resize:sw" => Some(UserEvent::Resize(ResizeDirection::SouthWest)),
                "window:resize:w" => Some(UserEvent::Resize(ResizeDirection::West)),
                "window:resize:nw" => Some(UserEvent::Resize(ResizeDirection::NorthWest)),
                _ => None,
            };
            if let Some(event) = event {
                let _ = proxy.send_event(event);
            }
        })
        .with_devtools(cfg!(debug_assertions))
        .with_on_page_load_handler(move |event, _url| {
            if matches!(event, PageLoadEvent::Finished) {
                let _ = proxy_load.send_event(UserEvent::PageLoaded);
            }
        });

    #[cfg(windows)]
    if !gpu_disabled {
        webview = webview.with_additional_browser_args(
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
             --autoplay-policy=no-user-gesture-required \
             --ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy \
             --disable-background-networking --disable-component-update",
        );
        log("GPU rendering enabled with WebView2 flags");
    }
    #[cfg(windows)]
    if gpu_disabled {
        log("GPU flags disabled by --no-gpu");
    }
    #[cfg(not(windows))]
    let _ = gpu_disabled;

    let webview = webview
        .build(&window)
        .map_err(|e| format!("could not create the webview: {}", e))?;

    let mut previous_state = saved_state;
    let mut pending_bounds = false;
    let mut was_maximized = false;
    let mut next_snapshot = Instant::now() + SNAPSHOT_EVERY;
    let mut reveal_by = Some(Instant::now() + REVEAL_AFTER);
    // Set while closing: when to give up waiting for the page, and whether to start the new version.
    let mut closing: Option<(Instant, bool)> = None;
    let data_dir_ev = data_dir.clone();
    let state_path_ev = state_path.clone();
    let last_ev = last_json.clone();

    event_loop.run(move |event, _target, control_flow| {
        let mut wake = next_snapshot;
        if let Some(at) = reveal_by {
            wake = wake.min(at);
        }
        if let Some((at, _)) = closing {
            wake = wake.min(at);
        }
        *control_flow = ControlFlow::WaitUntil(wake);

        // Asks the page for its newest edit; Flushed (or the deadline) finishes the job.
        let start_closing = |restart: bool| {
            let proxy = proxy_flush.clone();
            let asked = webview.evaluate_script_with_callback(
                "(window.KanbanFlush && window.KanbanFlush()) || null",
                move |reply| {
                    let json = serde_json::from_str::<Option<String>>(&reply).ok().flatten();
                    let _ = proxy.send_event(UserEvent::Flushed(json));
                },
            );
            let wait = if asked.is_ok() { FLUSH_WAIT } else { Duration::ZERO };
            Some((Instant::now() + wait, restart))
        };
        // Saves the final board after everything already queued, then ends the program.
        let finish = |newest: Option<String>, restart: bool| {
            let (done, wait) = mpsc::channel();
            if jobs.send(Job::Barrier(done)).is_ok() && wait.recv_timeout(DRAIN_WAIT).is_err() {
                log("pending saves took too long");
            }
            let json = newest.or_else(|| last_ev.lock().ok().and_then(|mut guard| guard.take()));
            if let Some(json) = json {
                let result = storage::save(&data_dir_ev, &json, true);
                log(&format!("final snapshot: ok={}", result.ok));
            }
            if restart {
                match updater::relaunch() {
                    Ok(()) => log("updated - starting the new version"),
                    Err(err) => log(&format!("updated, but could not start it: {}", err)),
                }
            }
            log("closing");
        };

        match event {
            Event::NewEvents(StartCause::ResumeTimeReached { .. }) => {
                let now = Instant::now();
                if let Some((at, restart)) = closing {
                    if now >= at {
                        log("the page did not answer in time");
                        finish(None, restart);
                        *control_flow = ControlFlow::Exit;
                        return;
                    }
                }
                if reveal_by.is_some_and(|at| now >= at) {
                    reveal_by = None;
                    reveal(&window, &previous_state);
                }
                if now >= next_snapshot {
                    next_snapshot = now + SNAPSHOT_EVERY;
                    let _ = jobs.send(Job::Snapshot);
                }
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            }
            | Event::UserEvent(UserEvent::Close) => {
                if closing.is_none() {
                    previous_state = winstate::capture(&window, &previous_state);
                    winstate::save(&state_path_ev, &previous_state);
                    closing = start_closing(false);
                    window.set_visible(false);
                }
            }
            Event::UserEvent(UserEvent::Restart) => {
                if closing.is_none() {
                    previous_state = winstate::capture(&window, &previous_state);
                    winstate::save(&state_path_ev, &previous_state);
                    closing = start_closing(true);
                }
            }
            Event::UserEvent(UserEvent::Flushed(json)) => {
                if let Some((_, restart)) = closing {
                    finish(json, restart);
                    *control_flow = ControlFlow::Exit;
                }
            }
            Event::UserEvent(UserEvent::Update(status)) => {
                run_script(
                    &webview,
                    &format!("window.__kanbanUpdate && window.__kanbanUpdate({});", status),
                );
            }
            Event::UserEvent(UserEvent::Minimize) => {
                previous_state = winstate::capture(&window, &previous_state);
                window.set_minimized(true);
            }
            Event::UserEvent(UserEvent::ToggleMaximize) => {
                if window.is_maximized() {
                    set_resize_frame(&window, true);
                    window.set_maximized(false);
                } else {
                    previous_state = winstate::capture(&window, &previous_state);
                    window.set_maximized(true);
                }
            }
            Event::UserEvent(UserEvent::PageLoaded) => {
                if reveal_by.take().is_some() {
                    reveal(&window, &previous_state);
                }
                was_maximized = window.is_maximized();
                sync_maximized(&webview, &window, was_maximized);
            }
            Event::UserEvent(UserEvent::Drag) => {
                if window.is_maximized() {
                    let max_size = window.inner_size();
                    let max_pos = window
                        .outer_position()
                        .unwrap_or(PhysicalPosition::new(0, 0));
                    let start = cursor_position();
                    set_resize_frame(&window, true);
                    restore_window(&window);
                    window.set_maximized(false);
                    if let Some((cx, cy)) = start {
                        let ratio = ((cx - max_pos.x) as f64 / max_size.width.max(1) as f64)
                            .clamp(0.0, 1.0);
                        let x = cx - (ratio * previous_state.width as f64).round() as i32;
                        let y = cy - 16;
                        window.set_outer_position(PhysicalPosition::new(x, y));
                    }
                }
                if let Err(err) = window.drag_window() {
                    log(&format!("window drag failed: {}", err));
                }
            }
            Event::UserEvent(UserEvent::Resize(direction)) => {
                if !window.is_maximized() {
                    if let Err(err) = window.drag_resize_window(direction) {
                        log(&format!("window resize failed: {}", err));
                    }
                }
            }
            Event::WindowEvent {
                event: WindowEvent::Resized(_) | WindowEvent::Moved(_),
                ..
            } => pending_bounds = true,
            Event::MainEventsCleared => {
                if pending_bounds {
                    pending_bounds = false;
                    if reveal_by.is_none() && !window.is_minimized() && !window.is_maximized() {
                        previous_state = winstate::capture(&window, &previous_state);
                    }
                }
                let maximized = window.is_maximized();
                if maximized != was_maximized {
                    was_maximized = maximized;
                    sync_maximized(&webview, &window, maximized);
                }
            }
            _ => {}
        }
    })
}

/// First time on screen (maximizing also shows the window, so it waits until here).
fn reveal(window: &tao::window::Window, state: &winstate::WindowState) {
    if state.maximized {
        window.set_maximized(true);
    }
    window.set_visible(true);
    window.set_focus();
    log("window shown");
}

fn decoded_path(request: &Request<Vec<u8>>) -> String {
    percent_decode_str(request.uri().path())
        .decode_utf8_lossy()
        .into_owned()
}

/// Page files that are inside the exe are answered at once, without the I/O thread.
fn embedded(request: &Request<Vec<u8>>) -> Option<Response<Cow<'static, [u8]>>> {
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return None;
    }
    let path = decoded_path(request);
    let relative = match path.trim_start_matches('/') {
        "" => "index.html",
        other => other,
    };
    let bytes = assets::get(relative)?;
    Some(resp(200, mime_for(Path::new(relative)), bytes))
}

fn not_found() -> Response<Cow<'static, [u8]>> {
    resp(404, "text/plain; charset=utf-8", b"not found".to_vec())
}

fn resp(
    status: u16,
    mime: &str,
    body: impl Into<Cow<'static, [u8]>>,
) -> Response<Cow<'static, [u8]>> {
    let status = StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "no-store")
        .body(body.into())
        .unwrap_or_else(|_| Response::new(Cow::Owned(Vec::new())))
}

fn json_resp(status: u16, body: String) -> Response<Cow<'static, [u8]>> {
    resp(status, "application/json; charset=utf-8", body.into_bytes())
}

fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        _ => "application/octet-stream",
    }
}

fn safe_path(base: &Path, relative: &str) -> Option<PathBuf> {
    let mut path = base.to_path_buf();
    for segment in relative.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." || segment.contains('\\') || segment.contains(':') || segment.contains('\0')
        {
            return None;
        }
        path.push(segment);
    }
    Some(path)
}

fn serve_file(base: &Path, relative: &str) -> Response<Cow<'static, [u8]>> {
    let Some(path) = safe_path(base, relative) else {
        return not_found();
    };
    match fs::read(&path) {
        Ok(bytes) => resp(200, mime_for(&path), bytes),
        Err(_) => not_found(),
    }
}

fn handle_request(
    request: Request<Vec<u8>>,
    app_dir: &Path,
    data_dir: &Path,
    last_json: &Mutex<Option<String>>,
) -> Response<Cow<'static, [u8]>> {
    let method = request.method().clone();
    let query = request.uri().query().unwrap_or("").to_string();
    let path = decoded_path(&request);
    let body = request.into_body();

    if method == Method::POST {
        match path.as_str() {
            "/__save" => {
                let json = String::from_utf8_lossy(&body).into_owned();
                let snapshot = query
                    .split('&')
                    .any(|pair| pair == "snapshot=1" || pair == "snapshot=true");
                let result = storage::save(data_dir, &json, snapshot);
                if result.ok {
                    if let Ok(mut guard) = last_json.lock() {
                        *guard = Some(json);
                    }
                    json_resp(200, "{\"ok\":true}".to_string())
                } else {
                    let error = result.error.unwrap_or_else(|| "ERROR".to_string());
                    let quoted = serde_json::to_string(&error).unwrap_or_else(|_| "\"ERROR\"".to_string());
                    log(&format!("save failed: {}", error));
                    json_resp(500, format!("{{\"ok\":false,\"error\":{}}}", quoted))
                }
            }
            "/__open-folder" => {
                let _ = std::process::Command::new("explorer.exe")
                    .arg(data_dir)
                    .spawn();
                resp(200, "text/plain; charset=utf-8", Vec::new())
            }
            "/__img-gc" => {
                let keep: Vec<String> = serde_json::from_slice(&body).unwrap_or_default();
                let removed = images::gc(data_dir, &keep);
                json_resp(200, removed.to_string())
            }
            _ => {
                if let Some(id) = path.strip_prefix("/__img/") {
                    if images::save(data_dir, id, &body) {
                        resp(200, "text/plain; charset=utf-8", Vec::new())
                    } else {
                        resp(400, "text/plain; charset=utf-8", b"bad image".to_vec())
                    }
                } else {
                    not_found()
                }
            }
        }
    } else if method == Method::GET || method == Method::HEAD {
        if let Some(id) = path.strip_prefix("/__img/") {
            match images::read(data_dir, id) {
                Some(bytes) => resp(200, mime_for(Path::new(id)), bytes),
                None => not_found(),
            }
        } else {
            let relative = path.trim_start_matches('/');
            let relative = if relative.is_empty() {
                "index.html"
            } else {
                relative
            };
            let lower = relative.to_ascii_lowercase();
            if lower.starts_with("kanban auto-backups/") {
                let inner = &relative["Kanban Auto-Backups/".len()..];
                serve_file(data_dir, inner)
            } else if relative.starts_with("__") {
                not_found()
            } else {
                serve_file(app_dir, relative)
            }
        }
    } else {
        not_found()
    }
}
