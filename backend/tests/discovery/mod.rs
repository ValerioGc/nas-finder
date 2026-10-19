use super::*;
use std::{
    sync::atomic::{AtomicBool, Ordering},
    sync::Arc,
    thread,
};

fn packet(nonce: &str, status: &str, port: u16, scheme: &str) -> String {
    format!(
        "NAS-OS/1\n{nonce}\n{}\nnas-studio\n{status}\n{port}\n{scheme}\n",
        "a".repeat(64)
    )
}

fn source() -> SocketAddr {
    SocketAddr::from(([192, 168, 1, 15], PORT))
}

fn device() -> NasDevice {
    parse_reply(
        packet("1234567890abcdef", "setup", 80, "http").as_bytes(),
        source(),
        "1234567890abcdef",
    )
    .unwrap()
}

#[test]
fn discovers_setup_and_configured_devices_without_trusting_advertised_hosts() {
    let setup = device();
    assert!(!setup.configured);
    assert_eq!(setup.url(), "http://192.168.1.15:80/");
    let ready = parse_reply(
        packet("1234567890abcdef", "ready", 443, "https").as_bytes(),
        source(),
        "1234567890abcdef",
    )
    .unwrap();
    assert!(ready.configured);
    assert_eq!(ready.url(), "https://192.168.1.15:443/");
}

#[test]
fn rejects_wrong_nonce_protocol_port_public_source_and_truncated_packets() {
    let valid = packet("1234567890abcdef", "ready", 443, "https");
    assert!(parse_reply(valid.as_bytes(), source(), "other").is_none());
    assert!(parse_reply(
        valid.replace("NAS-OS/1", "NAS-OS/2").as_bytes(),
        source(),
        "1234567890abcdef"
    )
    .is_none());
    assert!(parse_reply(
        valid.as_bytes(),
        SocketAddr::from(([192, 168, 1, 15], 80)),
        "1234567890abcdef"
    )
    .is_none());
    assert!(parse_reply(
        valid.as_bytes(),
        SocketAddr::from(([8, 8, 8, 8], PORT)),
        "1234567890abcdef"
    )
    .is_none());
    assert!(parse_reply(valid.trim_end().as_bytes(), source(), "1234567890abcdef").is_none());
    assert!(parse_reply(&[b'a'; 513], source(), "1234567890abcdef").is_none());
}

#[test]
fn rejects_injected_names_unknown_status_and_invalid_web_ports_or_schemes() {
    for packet in [
        packet("1234567890abcdef", "unknown", 80, "http"),
        packet("1234567890abcdef", "ready", 0, "http"),
        packet("1234567890abcdef", "ready", 80, "javascript"),
        packet("1234567890abcdef", "ready", 80, "http").replace("nas-studio", "<script>"),
        packet("1234567890abcdef", "ready", 80, "http").replace("nas-studio", "host\ninjected"),
    ] {
        assert!(parse_reply(packet.as_bytes(), source(), "1234567890abcdef").is_none());
    }
}

#[test]
fn manual_search_accepts_only_local_literal_ipv4_addresses() {
    assert_eq!(
        parse_target(" 192.168.1.15 "),
        Ok(Some(Ipv4Addr::new(192, 168, 1, 15)))
    );
    assert_eq!(
        parse_target("169.254.1.2"),
        Ok(Some(Ipv4Addr::new(169, 254, 1, 2)))
    );
    assert_eq!(parse_target(""), Ok(None));
    for invalid in [
        "https://192.168.1.1",
        "nas.local",
        "8.8.8.8",
        "::1",
        "255.255.255.255",
    ] {
        assert_eq!(parse_target(invalid), Err(FinderError::InvalidAddress));
    }
}

#[test]
fn computes_broadcasts_for_multiple_subnet_sizes() {
    assert_eq!(
        directed_broadcast(Ipv4Addr::new(192, 168, 3, 55), 24),
        Some(Ipv4Addr::new(192, 168, 3, 255))
    );
    assert_eq!(
        directed_broadcast(Ipv4Addr::new(10, 3, 0, 1), 16),
        Some(Ipv4Addr::new(10, 3, 255, 255))
    );
    assert_eq!(directed_broadcast(Ipv4Addr::new(10, 3, 0, 1), 32), None);
    assert_eq!(directed_broadcast(Ipv4Addr::new(8, 8, 8, 8), 24), None);
}

#[test]
fn keeps_missing_saved_devices_offline_and_merges_address_changes_by_identity() {
    let mut saved = device();
    saved.saved = true;
    let merged = merge_saved(&[saved.clone()], &[]);
    assert_eq!(merged.len(), 1);
    assert!(!merged[0].online);
    let mut moved = saved.clone();
    moved.address = Ipv4Addr::new(192, 168, 1, 20);
    moved.configured = true;
    let merged = merge_saved(&[saved], &[moved]);
    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].address, Ipv4Addr::new(192, 168, 1, 20));
    assert!(merged[0].configured);
    assert_eq!(
        merged[0].previous_endpoint,
        Some("http://192.168.1.15:80/".into())
    );
}

#[test]
fn requires_confirmation_for_address_port_or_protocol_changes_only() {
    let mut saved = device();
    saved.saved = true;
    let mut renamed = saved.clone();
    renamed.name = "renamed-nas".into();
    assert!(merge_saved(&[saved.clone()], &[renamed])[0]
        .previous_endpoint
        .is_none());
    for candidate in [
        NasDevice {
            address: Ipv4Addr::new(192, 168, 1, 99),
            ..saved.clone()
        },
        NasDevice {
            port: 8080,
            ..saved.clone()
        },
        NasDevice {
            secure: true,
            ..saved.clone()
        },
    ] {
        let merged = merge_saved(&[saved.clone()], &[candidate]);
        assert_eq!(merged[0].previous_endpoint, Some(saved.url()));
    }
}

#[test]
fn duplicate_replies_prefer_the_saved_address_regardless_of_arrival_order() {
    let lower = device();
    let mut higher = lower.clone();
    higher.address = Ipv4Addr::new(192, 168, 1, 20);

    for replies in [
        [lower.clone(), higher.clone()],
        [higher.clone(), lower.clone()],
    ] {
        for saved in [Vec::new(), vec![higher.clone()]] {
            let mut found = HashMap::new();
            for reply in replies.clone() {
                remember_device(&mut found, &saved, reply);
            }
            let result = found.get(&lower.id).unwrap();
            let expected = if saved.is_empty() { &lower } else { &higher };
            assert_eq!(result.address, expected.address);
            assert_eq!(result.saved, !saved.is_empty());
            assert_eq!(found.len(), 1);
        }
    }
}

#[test]
fn discovery_limit_rejects_new_identities_but_allows_a_preferred_address_update() {
    let mut found = HashMap::new();
    for index in 0..LIMIT {
        let mut candidate = device();
        candidate.id = format!("{index:064x}");
        remember_device(&mut found, &[], candidate);
    }

    let extra = device();
    remember_device(&mut found, &[], extra.clone());
    assert_eq!(found.len(), LIMIT);
    assert!(!found.contains_key(&extra.id));

    let mut moved = device();
    moved.id = format!("{:064x}", 0);
    moved.address = Ipv4Addr::new(192, 168, 1, 20);
    remember_device(&mut found, &[moved.clone()], moved.clone());
    assert_eq!(found.len(), LIMIT);
    assert_eq!(found[&moved.id].address, moved.address);
    assert!(found[&moved.id].saved);
}

#[test]
fn live_udp_scan_ignores_unrelated_replies_and_deduplicates_devices() {
    let server = UdpSocket::bind((Ipv4Addr::LOCALHOST, PORT)).unwrap();
    server
        .set_read_timeout(Some(Duration::from_millis(100)))
        .unwrap();
    let stopped = Arc::new(AtomicBool::new(false));
    let stop = stopped.clone();
    let worker = thread::spawn(move || {
        let mut buffer = [0; 256];
        while !stop.load(Ordering::Relaxed) {
            if let Ok((size, peer)) = server.recv_from(&mut buffer) {
                let query = std::str::from_utf8(&buffer[..size]).unwrap();
                let nonce = query.strip_prefix("NAS-OS-DISCOVER/1 ").unwrap();
                server
                    .send_to(packet("wrong", "setup", 80, "http").as_bytes(), peer)
                    .unwrap();
                let reply = packet(nonce, "setup", 80, "http");
                server.send_to(reply.as_bytes(), peer).unwrap();
                server.send_to(reply.as_bytes(), peer).unwrap();
            }
        }
    });
    let result = scan(
        &[Ipv4Addr::LOCALHOST],
        &[],
        "1234567890abcdef",
        Duration::from_millis(350),
    );
    stopped.store(true, Ordering::Relaxed);
    worker.join().unwrap();
    let found = result.unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].address, Ipv4Addr::LOCALHOST);
    assert!(found[0].online);
}
