use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tao::window::Window;

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct WindowState {
    pub width: u32,
    pub height: u32,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        WindowState {
            width: 1280,
            height: 800,
            x: None,
            y: None,
            maximized: false,
        }
    }
}

impl WindowState {
    fn sane(mut self) -> Self {
        if self.width <= 300 || self.height <= 300 {
            self.width = 1280;
            self.height = 800;
        }
        self
    }
}

pub fn load(path: &Path) -> WindowState {
    match fs::read_to_string(path) {
        Ok(text) => serde_json::from_str::<WindowState>(&text)
            .map(|s| s.sane())
            .unwrap_or_default(),
        Err(_) => WindowState::default(),
    }
}

pub fn save(path: &Path, state: &WindowState) {
    if let Ok(text) = serde_json::to_string(state) {
        let _ = fs::write(path, text);
    }
}

pub fn capture(window: &Window, previous: &WindowState) -> WindowState {
    let maximized = window.is_maximized();
    if maximized || window.is_minimized() {
        // While maximized/minimized the window reports screen or placeholder bounds;
        // keep the last normal bounds.
        return WindowState {
            maximized,
            ..previous.clone()
        };
    }
    let size = window.inner_size();
    let pos = window.outer_position().ok();
    WindowState {
        width: size.width.max(720),
        height: size.height.max(480),
        x: pos.map(|p| p.x),
        y: pos.map(|p| p.y),
        maximized: false,
    }
}
