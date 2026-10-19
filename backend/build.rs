fn main() {
    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "list_saved",
            "discover_nas",
            "save_nas",
            "forget_nas",
            "open_nas",
            "confirm_nas_endpoint",
            "minimize_window",
            "toggle_maximize_window",
            "close_window",
            "start_window_dragging",
        ]));
    tauri_build::try_build(attributes).expect("failed to build Tauri permissions");
}
