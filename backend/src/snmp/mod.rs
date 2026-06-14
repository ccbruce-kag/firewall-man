use serde_json::{json, Value};
use snmp2::{SyncSession, Value as SnmpValue};
use std::time::Duration;

fn snmp_value_to_string(val: &SnmpValue) -> String {
    match val {
        SnmpValue::Integer(i) => i.to_string(),
        SnmpValue::OctetString(s) => String::from_utf8_lossy(s).to_string(),
        SnmpValue::Null => "NULL".into(),
        SnmpValue::ObjectIdentifier(o) => o.to_string(),
        SnmpValue::IpAddress(a) => format!("{}.{}.{}.{}", a[0], a[1], a[2], a[3]),
        SnmpValue::Counter32(c) => c.to_string(),
        SnmpValue::Unsigned32(u) => u.to_string(),
        SnmpValue::Timeticks(t) => {
            let days = t / 8640000;
            let rem = t % 8640000;
            let hours = rem / 360000;
            let rem = rem % 360000;
            let mins = rem / 6000;
            let secs = (rem % 6000) / 100;
            let cs = t % 100;
            format!("{} ticks ({}d {}:{:02}:{:02}.{:02})", t, days, hours, mins, secs, cs)
        }
        SnmpValue::Opaque(o) => format!("Opaque({} bytes)", o.len()),
        SnmpValue::Counter64(c) => c.to_string(),
        SnmpValue::NoSuchObject => "noSuchObject".into(),
        SnmpValue::NoSuchInstance => "noSuchInstance".into(),
        SnmpValue::EndOfMibView => "endOfMibView".into(),
        _ => format!("{:?}", val),
    }
}

fn snmp_value_type(val: &SnmpValue) -> String {
    match val {
        SnmpValue::Integer(_) => "Integer".into(),
        SnmpValue::OctetString(_) => "OctetString".into(),
        SnmpValue::Null => "Null".into(),
        SnmpValue::ObjectIdentifier(_) => "ObjectId".into(),
        SnmpValue::IpAddress(_) => "IpAddress".into(),
        SnmpValue::Counter32(_) => "Counter32".into(),
        SnmpValue::Unsigned32(_) => "Unsigned32".into(),
        SnmpValue::Timeticks(_) => "Timeticks".into(),
        SnmpValue::Opaque(_) => "Opaque".into(),
        SnmpValue::Counter64(_) => "Counter64".into(),
        SnmpValue::NoSuchObject => "NoSuchObject".into(),
        SnmpValue::NoSuchInstance => "NoSuchInstance".into(),
        SnmpValue::EndOfMibView => "EndOfMibView".into(),
        _ => "Unknown".into(),
    }
}

fn parse_oid(input: &str) -> Result<snmp2::Oid<'static>, String> {
    input.parse().map_err(|e| format!("invalid OID: {:?}", e))
}

fn create_session(host: &str, port: u16, community: &str) -> Result<SyncSession, String> {
    let addr = format!("{}:{}", host, port);
    SyncSession::new_v2c(&addr, community.as_bytes(), Some(Duration::from_secs(5)), 1)
        .map_err(|e| format!("SNMP session failed: {}", e))
}

pub fn snmp_get(host: &str, port: u16, community: &str, oid: &str) -> Result<Value, String> {
    let oid = parse_oid(oid)?;
    let mut session = create_session(host, port, community)?;

    let pdu = session.get(&oid).map_err(|e| format!("SNMP get failed: {}", e))?;

    let mut results = Vec::new();
    for (resp_oid, value) in pdu.varbinds {
        results.push(json!({
            "oid": resp_oid.to_string(),
            "value": snmp_value_to_string(&value),
            "type": snmp_value_type(&value),
        }));
    }

    Ok(json!({"results": results}))
}

pub fn snmp_walk(host: &str, port: u16, community: &str, oid: &str) -> Result<Value, String> {
    let root_oid = parse_oid(oid)?;
    let mut session = create_session(host, port, community)?;

    let mut entries = Vec::new();
    let mut current_oid = root_oid.clone();

    loop {
        let next_oid = current_oid.clone();
        let pdu = match session.getnext(&next_oid) {
            Ok(p) => p,
            Err(e) => {
                if entries.is_empty() {
                    return Err(format!("SNMP walk failed: {}", e));
                }
                break;
            }
        };

        let root_str = oid.to_string();
        let mut has_valid = false;

        for (resp_oid, value) in pdu.varbinds {
            let oid_str = resp_oid.to_string();

            if !oid_str.starts_with(&root_str) {
                return Ok(json!({"results": entries, "count": entries.len()}));
            }

            match &value {
                SnmpValue::EndOfMibView | SnmpValue::NoSuchObject | SnmpValue::NoSuchInstance => {
                    return Ok(json!({"results": entries, "count": entries.len()}));
                }
                _ => {}
            }

            entries.push(json!({
                "oid": oid_str,
                "value": snmp_value_to_string(&value),
                "type": snmp_value_type(&value),
            }));
            current_oid = parse_oid(&oid_str)?;
            has_valid = true;
        }

        if !has_valid {
            break;
        }
    }

    Ok(json!({"results": entries, "count": entries.len()}))
}
