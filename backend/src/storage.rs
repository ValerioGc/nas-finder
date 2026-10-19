use crate::discovery::{FinderError, NasDevice};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
};

const MAX_BYTES: u64 = 65536;

/// Keep the returned handle alive for the complete read/modify/write operation.
pub fn lock(path: &Path) -> Result<File, FinderError> {
    let parent = path.parent().ok_or(FinderError::StorageUnavailable)?;
    fs::create_dir_all(parent).map_err(|_| FinderError::StorageUnavailable)?;
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options
        .open(path.with_extension("lock"))
        .map_err(|_| FinderError::StorageUnavailable)?;
    file.try_lock().map_err(|error| match error {
        std::fs::TryLockError::WouldBlock => FinderError::Busy,
        std::fs::TryLockError::Error(_) => FinderError::StorageUnavailable,
    })?;
    Ok(file)
}

pub fn load(path: &Path) -> Result<Vec<NasDevice>, FinderError> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err(FinderError::StorageUnavailable),
    };

    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| FinderError::StorageUnavailable)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(FinderError::StorageUnavailable);
    }

    let mut devices: Vec<NasDevice> =
        serde_json::from_slice(&bytes).map_err(|_| FinderError::StorageUnavailable)?;
    if devices.len() > 64 || devices.iter().any(|device| !device.valid()) {
        return Err(FinderError::StorageUnavailable);
    }

    let mut ids = std::collections::HashSet::new();
    if devices.iter().any(|device| !ids.insert(device.id.clone())) {
        return Err(FinderError::StorageUnavailable);
    }

    for device in &mut devices {
        device.online = false;
        device.saved = true;
        device.previous_endpoint = None;
    }

    Ok(devices)
}

fn persistent_devices(devices: &[NasDevice]) -> Vec<NasDevice> {
    let mut devices = devices.to_vec();
    for device in &mut devices {
        device.online = false;
        device.saved = true;
        device.previous_endpoint = None;
    }
    devices.sort_by(|a, b| a.id.cmp(&b.id));
    devices
}

pub fn persist_if_changed(
    path: &Path,
    previous: &[NasDevice],
    next: &[NasDevice],
) -> Result<bool, FinderError> {
    if persistent_devices(previous) == persistent_devices(next) {
        return Ok(false);
    }
    persist(path, next)?;
    Ok(true)
}

pub fn confirm_endpoint(
    path: &Path,
    saved: &mut [NasDevice],
    device: &mut NasDevice,
    expected_url: &str,
) -> Result<(), FinderError> {
    let previous = saved
        .iter_mut()
        .find(|old| old.id == device.id)
        .ok_or(FinderError::InvalidDevice)?;
    if device.previous_endpoint.as_deref() != Some(previous.url().as_str())
        || expected_url != device.url()
    {
        return Err(FinderError::EndpointChanged);
    }
    let mut confirmed = device.clone();
    confirmed.previous_endpoint = None;
    *previous = confirmed.clone();
    persist(path, saved)?;
    *device = confirmed;
    Ok(())
}

pub fn persist(path: &Path, devices: &[NasDevice]) -> Result<(), FinderError> {
    if devices.len() > 64 {
        return Err(FinderError::InvalidDevice);
    }

    let parent = path.parent().ok_or(FinderError::StorageUnavailable)?;
    fs::create_dir_all(parent).map_err(|_| FinderError::StorageUnavailable)?;
    let bytes = serde_json::to_vec(&persistent_devices(devices))
        .map_err(|_| FinderError::StorageUnavailable)?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(parent).map_err(|_| FinderError::StorageUnavailable)?;
    temporary
        .write_all(&bytes)
        .and_then(|()| temporary.as_file().sync_all())
        .map_err(|_| FinderError::StorageUnavailable)?;
    temporary
        .persist(path)
        .map_err(|_| FinderError::StorageUnavailable)?;
    #[cfg(unix)]
    File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| FinderError::StorageUnavailable)?;
    Ok(())
}

#[cfg(test)]
#[path = "../tests/storage/mod.rs"]
mod tests;
