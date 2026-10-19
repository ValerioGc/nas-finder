use super::*;
use std::{
    net::Ipv4Addr,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        Self(std::env::temp_dir().join(format!(
            "nas-finder-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        )))
    }
    fn path(&self) -> PathBuf {
        self.0.join("devices.json")
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn device() -> NasDevice {
    NasDevice {
        id: "a".repeat(64),
        name: "nas-studio".into(),
        address: Ipv4Addr::new(192, 168, 1, 10),
        port: 80,
        secure: false,
        configured: false,
        online: true,
        saved: true,
        previous_endpoint: None,
    }
}

#[test]
fn first_launch_has_an_empty_list_and_saved_online_state_is_never_trusted() {
    let fixture = Fixture::new();
    assert_eq!(load(&fixture.path()).unwrap(), Vec::<NasDevice>::new());
    persist(&fixture.path(), &[device()]).unwrap();

    let restored = load(&fixture.path()).unwrap();
    assert_eq!(restored.len(), 1);
    assert!(!restored[0].online);
    assert!(restored[0].saved);
}

#[test]
fn replaces_the_previous_file_and_can_forget_the_last_device() {
    let fixture = Fixture::new();
    persist(&fixture.path(), &[device()]).unwrap();

    let mut changed = device();
    changed.address = Ipv4Addr::new(192, 168, 1, 20);
    persist(&fixture.path(), &[changed.clone()]).unwrap();
    assert_eq!(load(&fixture.path()).unwrap()[0].address, changed.address);
    persist(&fixture.path(), &[]).unwrap();
    assert!(load(&fixture.path()).unwrap().is_empty());
}

#[test]
fn reports_corruption_instead_of_silently_overwriting_saved_devices() {
    let fixture = Fixture::new();
    fs::create_dir_all(&fixture.0).unwrap();
    fs::write(fixture.path(), b"not json").unwrap();
    assert_eq!(load(&fixture.path()), Err(FinderError::StorageUnavailable));
    assert_eq!(fs::read(fixture.path()).unwrap(), b"not json");
}

#[test]
fn rejects_invalid_duplicate_and_oversized_saved_lists() {
    let fixture = Fixture::new();
    persist(&fixture.path(), &[device(), device()]).unwrap();
    assert_eq!(load(&fixture.path()), Err(FinderError::StorageUnavailable));

    let mut invalid = device();
    invalid.address = Ipv4Addr::new(8, 8, 8, 8);
    persist(&fixture.path(), &[invalid]).unwrap();

    assert_eq!(load(&fixture.path()), Err(FinderError::StorageUnavailable));
    assert_eq!(
        persist(&fixture.path(), &vec![device(); 65]),
        Err(FinderError::InvalidDevice)
    );

    fs::write(fixture.path(), vec![b' '; 65537]).unwrap();
    assert_eq!(load(&fixture.path()), Err(FinderError::StorageUnavailable));
}

#[test]
fn limits_reads_of_a_large_sparse_file() {
    let fixture = Fixture::new();
    fs::create_dir_all(&fixture.0).unwrap();
    let file = File::create(fixture.path()).unwrap();
    file.set_len(1024 * 1024 * 1024).unwrap();
    assert_eq!(load(&fixture.path()), Err(FinderError::StorageUnavailable));
}

#[test]
fn only_rewrites_persistent_changes_and_ignores_runtime_flags_and_order() {
    let fixture = Fixture::new();
    let first = device();
    let mut second = first.clone();
    second.id = "b".repeat(64);
    persist(&fixture.path(), &[first.clone(), second.clone()]).unwrap();
    let previous = load(&fixture.path()).unwrap();
    let original = fs::read(fixture.path()).unwrap();
    assert!(!persist_if_changed(&fixture.path(), &previous, &[second, first.clone()]).unwrap());
    assert_eq!(fs::read(fixture.path()).unwrap(), original);
    let mut next = previous.clone();
    next[0].address = Ipv4Addr::new(192, 168, 1, 20);
    assert!(persist_if_changed(&fixture.path(), &previous, &next).unwrap());
    assert_eq!(load(&fixture.path()).unwrap(), next);
}

#[test]
fn excludes_concurrent_file_handles_and_releases_the_lock() {
    let fixture = Fixture::new();
    let guard = lock(&fixture.path()).unwrap();
    assert!(matches!(lock(&fixture.path()), Err(FinderError::Busy)));
    drop(guard);
    assert!(lock(&fixture.path()).is_ok());
}

#[test]
fn lock_process_fixture() {
    if let Some(path) = std::env::var_os("NAS_FINDER_LOCK_FIXTURE_PATH") {
        match lock(Path::new(&path)) {
            Ok(_) => std::process::exit(0),
            Err(FinderError::Busy) => std::process::exit(42),
            Err(_) => std::process::exit(1),
        }
    }
}

#[test]
fn excludes_a_second_process_until_the_transaction_finishes() {
    let fixture = Fixture::new();
    let guard = lock(&fixture.path()).unwrap();
    let child_status = || {
        std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "storage::tests::lock_process_fixture"])
            .env("NAS_FINDER_LOCK_FIXTURE_PATH", fixture.path())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap()
            .code()
    };
    assert_eq!(child_status(), Some(42));
    drop(guard);
    assert_eq!(child_status(), Some(0));
}

#[test]
fn does_not_follow_a_preexisting_temporary_path_and_cleans_up_its_own() {
    let fixture = Fixture::new();
    fs::create_dir_all(&fixture.0).unwrap();
    let legacy_temp = fixture.path().with_extension("json.tmp");
    fs::write(&legacy_temp, b"preserved").unwrap();
    persist(&fixture.path(), &[device()]).unwrap();
    assert_eq!(fs::read(&legacy_temp).unwrap(), b"preserved");
    assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 2);
}

#[test]
fn confirms_only_the_displayed_endpoint_and_preserves_the_old_file_on_mismatch() {
    let fixture = Fixture::new();
    persist(&fixture.path(), &[device()]).unwrap();
    let mut saved = load(&fixture.path()).unwrap();
    let previous = saved[0].clone();
    let mut candidate = device();
    candidate.address = Ipv4Addr::new(192, 168, 1, 20);
    candidate.previous_endpoint = Some(previous.url());
    assert_eq!(
        confirm_endpoint(
            &fixture.path(),
            &mut saved,
            &mut candidate,
            "http://192.168.1.99:80/"
        ),
        Err(FinderError::EndpointChanged)
    );
    assert_eq!(load(&fixture.path()).unwrap(), vec![previous.clone()]);
    let expected = candidate.url();
    confirm_endpoint(&fixture.path(), &mut saved, &mut candidate, &expected).unwrap();
    assert!(candidate.previous_endpoint.is_none());
    assert_eq!(load(&fixture.path()).unwrap()[0].address, candidate.address);
    candidate.previous_endpoint = Some(previous.url());
    assert_eq!(
        confirm_endpoint(&fixture.path(), &mut saved, &mut candidate, &expected),
        Err(FinderError::EndpointChanged)
    );
}
