mod commands;
mod discovery;
mod storage;
mod system_command;
mod titlebar;

pub fn run() {
    tauri::Builder::default()
        .manage(commands::FinderState::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_saved,
            commands::discover_nas,
            commands::save_nas,
            commands::forget_nas,
            commands::open_nas,
            commands::confirm_nas_endpoint,
            titlebar::minimize_window,
            titlebar::toggle_maximize_window,
            titlebar::close_window,
            titlebar::start_window_dragging,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NAS Finder");
}
