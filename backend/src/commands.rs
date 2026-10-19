use crate::{
    discovery::{self, FinderError, NasDevice},
    storage,
};
use std::{
    path::PathBuf,
    process::Command,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct FinderState {
    operation: Arc<Mutex<()>>,
    latest: Arc<Mutex<Vec<NasDevice>>>,
}

fn path(app: &AppHandle) -> Result<PathBuf, FinderError> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("devices.json"))
        .map_err(|_| FinderError::StorageUnavailable)
}

async fn work<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, FinderError> + Send + 'static,
) -> Result<T, FinderError> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|_| FinderError::NetworkUnavailable)?
}

#[tauri::command]
pub async fn list_saved(
    app: AppHandle,
    state: State<'_, FinderState>,
) -> Result<Vec<NasDevice>, FinderError> {
    let path = path(&app)?;
    let operation = state.operation.clone();
    work(move || {
        let _guard = operation.try_lock().map_err(|_| FinderError::Busy)?;
        let _storage_guard = storage::lock(&path)?;
        storage::load(&path)
    })
    .await
}

#[tauri::command]
pub async fn discover_nas(
    app: AppHandle,
    state: State<'_, FinderState>,
    target: Option<String>,
) -> Result<Vec<NasDevice>, FinderError> {
    let target = discovery::parse_target(target.as_deref().unwrap_or_default())?;
    let path = path(&app)?;
    let operation = state.operation.clone();
    let latest = state.latest.clone();
    work(move || {
        let _guard = operation.try_lock().map_err(|_| FinderError::Busy)?;
        for device in latest.lock().map_err(|_| FinderError::Busy)?.iter_mut() {
            device.online = false;
        }
        let _storage_guard = storage::lock(&path)?;
        let saved = storage::load(&path)?;
        let found = discovery::discover(&saved, target)?;
        let merged = discovery::merge_saved(&saved, &found);
        let updated: Vec<_> = merged
            .iter()
            .filter(|device| device.saved)
            .map(|device| {
                saved
                    .iter()
                    .find(|old| old.id == device.id && device.previous_endpoint.is_some())
                    .unwrap_or(device)
                    .clone()
            })
            .collect();

        storage::persist_if_changed(&path, &saved, &updated)?;

        *latest.lock().map_err(|_| FinderError::Busy)? = merged.clone();
        Ok(merged)
    })
    .await
}

#[tauri::command]
pub async fn save_nas(
    app: AppHandle,
    state: State<'_, FinderState>,
    id: String,
) -> Result<(), FinderError> {
    let path = path(&app)?;
    let operation = state.operation.clone();
    let latest = state.latest.clone();
    work(move || {
        let _guard = operation.try_lock().map_err(|_| FinderError::Busy)?;
        let _storage_guard = storage::lock(&path)?;
        let mut latest = latest.lock().map_err(|_| FinderError::Busy)?;
        let device = latest
            .iter_mut()
            .find(|device| device.id == id && device.online)
            .ok_or(FinderError::InvalidDevice)?;
        if device.previous_endpoint.is_some() {
            return Err(FinderError::EndpointChanged);
        }

        let mut saved = storage::load(&path)?;
        if let Some(previous) = saved.iter_mut().find(|previous| previous.id == id) {
            if previous.url() != device.url() {
                return Err(FinderError::EndpointChanged);
            }
            *previous = device.clone();
        } else {
            saved.push(device.clone());
        }
        storage::persist(&path, &saved)?;
        device.saved = true;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn forget_nas(
    app: AppHandle,
    state: State<'_, FinderState>,
    id: String,
) -> Result<(), FinderError> {
    if id.len() != 64 || !id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(FinderError::InvalidDevice);
    }

    let path = path(&app)?;
    let operation = state.operation.clone();
    let latest = state.latest.clone();
    work(move || {
        let _guard = operation.try_lock().map_err(|_| FinderError::Busy)?;
        let _storage_guard = storage::lock(&path)?;
        let mut saved = storage::load(&path)?;
        saved.retain(|device| device.id != id);
        storage::persist(&path, &saved)?;
        if let Some(device) = latest
            .lock()
            .map_err(|_| FinderError::Busy)?
            .iter_mut()
            .find(|device| device.id == id)
        {
            device.saved = false;
            device.previous_endpoint = None;
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn open_nas(state: State<'_, FinderState>, id: String) -> Result<(), FinderError> {
    let operation = state.operation.clone();
    let latest = state.latest.clone();
    work(move || {
        let _guard = operation.try_lock().map_err(|_| FinderError::Busy)?;
        let url = {
            let latest = latest.lock().map_err(|_| FinderError::Busy)?;
            let device = latest
                .iter()
                .find(|device| device.id == id && device.online && device.valid())
                .ok_or(FinderError::InvalidDevice)?;
            if device.previous_endpoint.is_some() {
                return Err(FinderError::EndpointChanged);
            }
            device.url()
        };
        #[cfg(target_os = "windows")]
        let mut command = {
            let mut cmd = Command::new("rundll32.exe");
            cmd.arg("url.dll,FileProtocolHandler");
            cmd
        };

        #[cfg(target_os = "macos")]
        let mut command = Command::new("open");
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        let mut command = Command::new("xdg-open");
        let mut child = command
            .arg(url)
            .spawn()
            .map_err(|_| FinderError::BrowserUnavailable)?;

        std::thread::spawn(move || {
            let _ = child.wait();
        });
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn confirm_nas_endpoint(
    app: AppHandle,
    state: State<'_, FinderState>,
    id: String,
    expected_url: String,
) -> Result<NasDevice, FinderError> {
    let path = path(&app)?;
    let operation = state.operation.clone();
    let latest = state.latest.clone();
    work(move || {
        let _guard = operation.try_lock().map_err(|_| FinderError::Busy)?;
        let _storage_guard = storage::lock(&path)?;
        let mut latest = latest.lock().map_err(|_| FinderError::Busy)?;
        let device = latest
            .iter_mut()
            .find(|device| device.id == id && device.online && device.saved && device.valid())
            .ok_or(FinderError::InvalidDevice)?;
        let mut saved = storage::load(&path)?;
        storage::confirm_endpoint(&path, &mut saved, device, &expected_url)?;
        Ok(device.clone())
    })
    .await
}
