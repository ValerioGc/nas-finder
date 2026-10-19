use crate::system_command;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    hash::{BuildHasher, Hasher},
    net::{Ipv4Addr, SocketAddr, UdpSocket},
    process::Command,
    time::{Duration, Instant},
};

pub const PORT: u16 = 39877;
const LIMIT: usize = 128;
const INTERFACE_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NasDevice {
    pub id: String,
    pub name: String,
    pub address: Ipv4Addr,
    pub port: u16,
    pub secure: bool,
    pub configured: bool,
    pub online: bool,
    pub saved: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous_endpoint: Option<String>,
}

impl NasDevice {
    pub fn url(&self) -> String {
        format!(
            "{}://{}:{}/",
            if self.secure { "https" } else { "http" },
            self.address,
            self.port
        )
    }

    pub fn valid(&self) -> bool {
        self.id.len() == 64
            && self.id.bytes().all(|b| b.is_ascii_hexdigit())
            && !self.name.is_empty()
            && self.name.len() <= 63
            && self
                .name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b".-_".contains(&b))
            && local_address(self.address)
            && self.port != 0
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FinderError {
    InvalidAddress,
    NetworkUnavailable,
    Busy,
    StorageUnavailable,
    InvalidDevice,
    BrowserUnavailable,
    EndpointChanged,
}

pub fn local_address(ip: Ipv4Addr) -> bool {
    ip.is_private() || ip.is_link_local() || ip.is_loopback()
}

pub fn parse_target(value: &str) -> Result<Option<Ipv4Addr>, FinderError> {
    if value.trim().is_empty() {
        return Ok(None);
    }
    let ip = value
        .trim()
        .parse()
        .map_err(|_| FinderError::InvalidAddress)?;

    if local_address(ip) {
        Ok(Some(ip))
    } else {
        Err(FinderError::InvalidAddress)
    }
}

pub fn parse_reply(bytes: &[u8], source: SocketAddr, nonce: &str) -> Option<NasDevice> {
    if bytes.len() > 512 || source.port() != PORT {
        return None;
    }

    let SocketAddr::V4(source) = source else {
        return None;
    };

    let text = std::str::from_utf8(bytes).ok()?;
    let fields: Vec<_> = text.split('\n').collect();
    if fields.len() != 8 || fields[0] != "NAS-OS/1" || fields[1] != nonce || !fields[7].is_empty() {
        return None;
    }

    let device = NasDevice {
        id: fields[2].to_owned(),
        name: fields[3].to_owned(),
        address: *source.ip(),
        configured: match fields[4] {
            "setup" => false,
            "ready" => true,
            _ => return None,
        },
        port: fields[5].parse().ok()?,
        secure: match fields[6] {
            "http" => false,
            "https" => true,
            _ => return None,
        },
        online: true,
        saved: false,
        previous_endpoint: None,
    };
    device.valid().then_some(device)
}

/// Returns a list of broadcast addresses for the local machine's IPv4 network interfaces.
fn broadcasts() -> Vec<Ipv4Addr> {
    #[cfg(target_os = "linux")]
    {
        system_command::output(
            Command::new("ip").args(["-j", "-4", "address", "show", "up"]),
            INTERFACE_TIMEOUT,
        )
        .and_then(|out| serde_json::from_slice::<serde_json::Value>(&out).ok())
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default()
        .iter()
        .flat_map(|adapter| {
            adapter["addr_info"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|info| {
                    let ip: Ipv4Addr = info["local"].as_str()?.parse().ok()?;
                    local_address(ip)
                        .then(|| info["broadcast"].as_str()?.parse().ok())
                        .flatten()
                })
                .collect::<Vec<_>>()
        })
        .collect()
    }

    #[cfg(target_os = "windows")]
    {
        let script = "Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred | Select-Object IPAddress,PrefixLength | ConvertTo-Json -Compress";
        let values = system_command::output(
            Command::new("powershell.exe").args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                script,
            ]),
            INTERFACE_TIMEOUT,
        )
        .and_then(|out| serde_json::from_slice::<serde_json::Value>(&out).ok());
        values
            .into_iter()
            .flat_map(|value| match value {
                serde_json::Value::Array(items) => items,
                other => vec![other],
            })
            .filter_map(|value| {
                let ip = value["IPAddress"].as_str()?.parse().ok()?;
                directed_broadcast(ip, u8::try_from(value["PrefixLength"].as_u64()?).ok()?)
            })
            .collect()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Vec::new()
    }
}

#[cfg(any(target_os = "windows", test))]
fn directed_broadcast(ip: Ipv4Addr, prefix: u8) -> Option<Ipv4Addr> {
    if !local_address(ip) || !(1..=30).contains(&prefix) {
        return None;
    }

    Some(Ipv4Addr::from(u32::from(ip) | (u32::MAX >> prefix)))
}

pub fn discover(
    saved: &[NasDevice],
    target: Option<Ipv4Addr>,
) -> Result<Vec<NasDevice>, FinderError> {
    let mut addresses = if let Some(target) = target {
        let mut targets: Vec<_> = saved.iter().map(|device| device.address).collect();
        targets.push(target);
        targets
    } else {
        let mut targets = broadcasts();
        targets.push(Ipv4Addr::BROADCAST);
        targets.extend(saved.iter().map(|device| device.address));
        targets
    };

    addresses.sort_unstable();
    addresses.dedup();

    let nonce = format!(
        "{:016x}",
        std::collections::hash_map::RandomState::new()
            .build_hasher()
            .finish()
    );

    scan(&addresses, saved, &nonce, Duration::from_secs(3))
}

fn scan(
    addresses: &[Ipv4Addr],
    saved: &[NasDevice],
    nonce: &str,
    duration: Duration,
) -> Result<Vec<NasDevice>, FinderError> {
    let socket =
        UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).map_err(|_| FinderError::NetworkUnavailable)?;
    socket
        .set_broadcast(true)
        .map_err(|_| FinderError::NetworkUnavailable)?;
    socket
        .set_read_timeout(Some(Duration::from_millis(120)))
        .map_err(|_| FinderError::NetworkUnavailable)?;

    let query = format!("NAS-OS-DISCOVER/1 {nonce}");
    let started = Instant::now();
    let mut next_send = Duration::ZERO;
    let mut found = HashMap::<String, NasDevice>::new();
    let mut received = [0; 513];
    while started.elapsed() < duration {
        if started.elapsed() >= next_send {
            send_query(&socket, addresses, query.as_bytes())?;
            next_send += Duration::from_millis(900);
        }

        if let Some(device) = receive_reply(&socket, &mut received, nonce)? {
            remember_device(&mut found, saved, device);
        }
    }

    let mut devices: Vec<_> = found.into_values().collect();
    devices.sort_by(|a, b| a.name.cmp(&b.name).then(a.id.cmp(&b.id)));
    Ok(devices)
}

fn send_query(socket: &UdpSocket, addresses: &[Ipv4Addr], query: &[u8]) -> Result<(), FinderError> {
    let mut sent = false;
    for ip in addresses {
        sent |= socket.send_to(query, (*ip, PORT)).is_ok();
    }

    if sent {
        Ok(())
    } else {
        Err(FinderError::NetworkUnavailable)
    }
}

fn receive_reply(
    socket: &UdpSocket,
    received: &mut [u8],
    nonce: &str,
) -> Result<Option<NasDevice>, FinderError> {
    match socket.recv_from(received) {
        Ok((length, source)) => Ok(parse_reply(&received[..length], source, nonce)),
        Err(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
            ) =>
        {
            Ok(None)
        }
        Err(_) => Err(FinderError::NetworkUnavailable),
    }
}

fn remember_device(
    found: &mut HashMap<String, NasDevice>,
    saved: &[NasDevice],
    mut device: NasDevice,
) {
    let previous = saved.iter().find(|old| old.id == device.id);
    device.saved = previous.is_some();
    let preferred = previous.map(|old| old.address);

    if found.get(&device.id).is_some_and(|old| {
        let old_rank = (preferred != Some(old.address), old.address);
        let new_rank = (preferred != Some(device.address), device.address);
        old_rank <= new_rank
    }) {
        return;
    }

    if found.len() < LIMIT || found.contains_key(&device.id) {
        found.insert(device.id.clone(), device);
    }
}

pub fn merge_saved(saved: &[NasDevice], found: &[NasDevice]) -> Vec<NasDevice> {
    let mut merged = found.to_vec();
    for device in &mut merged {
        if let Some(previous) = saved.iter().find(|old| old.id == device.id) {
            device.saved = true;
            device.previous_endpoint = (previous.url() != device.url()).then(|| previous.url());
        }
    }
    for previous in saved {
        if !merged.iter().any(|device| device.id == previous.id) {
            let mut offline = previous.clone();
            offline.online = false;
            offline.saved = true;
            merged.push(offline);
        }
    }
    merged
}

#[cfg(test)]
#[path = "../tests/discovery/mod.rs"]
mod tests;
