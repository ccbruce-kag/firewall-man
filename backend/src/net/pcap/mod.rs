use serde_json::{json, Value};
use std::net::Ipv4Addr;

pub fn list_interfaces() -> Value {
    let devices = pcap::Device::list().unwrap_or_default();
    let interfaces: Vec<Value> = devices.into_iter().map(|d| {
        let addrs: Vec<Value> = d.addresses.into_iter().map(|a| {
            json!({
                "addr": a.addr.to_string(),
                "netmask": a.netmask.map(|m| m.to_string()),
            })
        }).collect();
        json!({
            "name": d.name,
            "description": d.desc.unwrap_or_default(),
            "addresses": addrs,
        })
    }).collect();
    json!(interfaces)
}

pub fn capture_packets(interface: &str, filter: &str, count: usize, timeout_secs: u64) -> Result<Vec<Value>, String> {
    let mut cap = pcap::Capture::from_device(interface)
        .map_err(|e| format!("open device failed: {}", e))?
        .promisc(true)
        .snaplen(65535)
        .timeout(1000)
        .open()
        .map_err(|e| format!("open capture failed: {}", e))?;

    if !filter.is_empty() {
        cap.filter(filter, true)
            .map_err(|e| format!("set filter failed: {}", e))?;
    }

    let start = std::time::Instant::now();
    let deadline = std::time::Duration::from_secs(timeout_secs);
    let max_count = if count == 0 { usize::MAX } else { count };
    let mut packets = Vec::new();
    let mut idx: u64 = 0;

    while packets.len() < max_count && start.elapsed() < deadline {
        match cap.next_packet() {
            Ok(pkt) => {
                idx += 1;
                let ts = pkt.header.ts.tv_sec as f64 + pkt.header.ts.tv_usec as f64 / 1_000_000.0;
                packets.push(parse_packet(pkt.data, idx, ts));
            }
            Err(pcap::Error::TimeoutExpired) => continue,
            Err(e) => {
                if packets.is_empty() {
                    return Err(format!("capture error: {}", e));
                }
                break;
            }
        }
    }

    Ok(packets)
}

fn parse_packet(data: &[u8], index: u64, timestamp: f64) -> Value {
    let mut src = "N/A".to_string();
    let mut dst = "N/A".to_string();
    let mut proto = "Unknown".to_string();
    let mut info = String::new();

    if data.len() >= 14 {
        let eth_type = u16::from_be_bytes([data[12], data[13]]);
        let payload = &data[14..];

        match eth_type {
            0x0800 => parse_ipv4(payload, &mut src, &mut dst, &mut proto, &mut info),
            0x86DD => parse_ipv6(payload, &mut src, &mut dst, &mut proto, &mut info),
            0x0806 => {
                proto = "ARP".into();
                info = format!("ARP, len={}", payload.len());
            }
            _ => {
                proto = format!("0x{:04X}", eth_type);
            }
        }
    }

    json!({
        "index": index,
        "time": format!("{:.6}", timestamp),
        "src": src,
        "dst": dst,
        "proto": proto,
        "len": data.len(),
        "info": info,
        "hex": hex_dump(data),
    })
}

fn parse_ipv4(data: &[u8], src: &mut String, dst: &mut String, proto: &mut String, info: &mut String) {
    if data.len() < 20 { return; }
    let ihl = (data[0] & 0x0F) as usize * 4;
    if data.len() < ihl { return; }

    let protocol = data[9];
    let src_ip = Ipv4Addr::new(data[12], data[13], data[14], data[15]);
    let dst_ip = Ipv4Addr::new(data[16], data[17], data[18], data[19]);
    *src = src_ip.to_string();
    *dst = dst_ip.to_string();

    let transport = &data[ihl..];

    match protocol {
        6 => {
            *proto = "TCP".into();
            parse_tcp(transport, src, dst, info);
        }
        17 => {
            *proto = "UDP".into();
            parse_udp(transport, info);
        }
        1 => {
            *proto = "ICMP".into();
            if transport.len() >= 2 {
                *info = format!("ICMP type={} code={}", transport[0], transport[1]);
            }
        }
        _ => {
            *proto = format!("IP-{}", protocol);
        }
    }
}

fn parse_ipv6(data: &[u8], src: &mut String, dst: &mut String, proto: &mut String, info: &mut String) {
    if data.len() < 40 { return; }
    let next_header = data[6];
    *src = format!(
        "{:02x}{:02x}:{:02x}{:02x}:{:02x}{:02x}:{:02x}{:02x}:{:02x}{:02x}:{:02x}{:02x}:{:02x}{:02x}:{:02x}{:02x}",
        data[8], data[9], data[10], data[11], data[12], data[13], data[14], data[15],
        data[16], data[17], data[18], data[19], data[20], data[21], data[22], data[23]
    );
    *dst = format!(
        "{:02x}{:02x}:{:02x}{:02x}:{:02x}{:02x}:{:02x}{:02x}:{:02x}{:02x}:{:02x}{:02x}:{:02x}{:02x}:{:02x}{:02x}",
        data[24], data[25], data[26], data[27], data[28], data[29], data[30], data[31],
        data[32], data[33], data[34], data[35], data[36], data[37], data[38], data[39]
    );
    let transport = &data[40..];
    match next_header {
        6 => { *proto = "TCP".into(); parse_tcp(transport, src, dst, info); }
        17 => { *proto = "UDP".into(); parse_udp(transport, info); }
        58 => { *proto = "ICMPv6".into(); if transport.len() >= 2 { *info = format!("ICMPv6 type={} code={}", transport[0], transport[1]); } }
        _ => { *proto = format!("IPv6-{}", next_header); }
    }
}

fn parse_tcp(data: &[u8], src: &str, dst: &str, info: &mut String) {
    if data.len() < 20 { return; }
    let sport = u16::from_be_bytes([data[0], data[1]]);
    let dport = u16::from_be_bytes([data[2], data[3]]);
    let flags = data[13];
    let mut f = String::new();
    if flags & 0x02 != 0 { f.push_str("SYN "); }
    if flags & 0x10 != 0 { f.push_str("ACK "); }
    if flags & 0x01 != 0 { f.push_str("FIN "); }
    if flags & 0x04 != 0 { f.push_str("RST "); }
    if flags & 0x08 != 0 { f.push_str("PSH "); }
    if flags & 0x20 != 0 { f.push_str("URG "); }
    *info = format!("{}:{} > {}:{} [{}]", src, sport, dst, dport, f.trim());
}

fn parse_udp(data: &[u8], info: &mut String) {
    if data.len() < 8 { return; }
    let sport = u16::from_be_bytes([data[0], data[1]]);
    let dport = u16::from_be_bytes([data[2], data[3]]);
    let len = u16::from_be_bytes([data[4], data[5]]);
    *info = format!("{} > {} len={}", sport, dport, len);
}

fn hex_dump(data: &[u8]) -> String {
    let mut s = String::new();
    for (i, chunk) in data.chunks(16).enumerate() {
        s.push_str(&format!("{:04x}  ", i * 16));
        for (j, b) in chunk.iter().enumerate() {
            s.push_str(&format!("{:02x} ", b));
            if j == 7 { s.push(' '); }
        }
        if chunk.len() < 16 {
            for _ in 0..(16 - chunk.len()) { s.push_str("   "); }
            if chunk.len() <= 7 { s.push(' '); }
        }
        s.push(' ');
        for b in chunk {
            if b.is_ascii_graphic() || *b == b' ' { s.push(*b as char); }
            else { s.push('.'); }
        }
        s.push('\n');
    }
    s
}
