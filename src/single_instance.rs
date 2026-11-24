use std::time::Duration;

/// True when another copy is running. `wait` gives that copy time to finish first (used right after
/// an update, when the old program is still closing).
#[cfg(windows)]
pub fn another_instance_running(wait: Duration) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;

    let name: Vec<u16> = "KanbanBoardRustInstance\0".encode_utf16().collect();
    let deadline = std::time::Instant::now() + wait;
    loop {
        // On success the handle is deliberately never closed: it lives until the process exits,
        // which is exactly the lifetime the single-instance check needs.
        unsafe {
            let handle = CreateMutexW(std::ptr::null(), 0, name.as_ptr());
            if handle.is_null() || GetLastError() != ERROR_ALREADY_EXISTS {
                return false;
            }
            CloseHandle(handle);
        }
        if std::time::Instant::now() >= deadline {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(not(windows))]
pub fn another_instance_running(_wait: Duration) -> bool {
    false
}
