use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::process::Command;
use tokio::time::timeout;

#[derive(Clone, Serialize, Deserialize)]
pub struct CvsSource {
    pub id: i64,
    pub name: String,
    pub url: String,
    pub table_name: String,
    pub delimiter: String,
    pub has_header: bool,
    pub auto_import: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct CvsSourceInput {
    pub name: String,
    pub url: String,
    pub table_name: String,
    pub delimiter: Option<String>,
    pub has_header: Option<bool>,
    pub auto_import: Option<bool>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ScanTask {
    pub id: i64,
    pub name: String,
    pub target: String,
    pub ports: String,
    pub scan_type: String,
    pub status: String,
    pub result_summary: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub id: i64,
    pub task_id: i64,
    pub ip: String,
    pub port: i64,
    pub protocol: String,
    pub service: Option<String>,
    pub state: String,
    pub banner: Option<String>,
}

#[derive(Clone, Deserialize)]
pub struct ScanTaskInput {
    pub name: String,
    pub target: String,
    pub ports: Option<String>,
    pub scan_type: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct CvsImportResult {
    pub row_count: usize,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Value>>,
    pub preview: Vec<Vec<Value>>,
}

pub async fn download_and_parse_csv(url: &str, delimiter: &str, has_header: bool) -> Result<CvsImportResult, String> {
    let output = Command::new("curl")
        .args(["-s", "-L", "-m", "30", url])
        .output()
        .await
        .map_err(|e| format!("download failed: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("download failed: {stderr}"));
    }
    let body = String::from_utf8_lossy(&output.stdout).to_string();
    let mut lines: Vec<&str> = body.split('\n').collect();
    while lines.last().map(|l| l.trim().is_empty()) == Some(true) {
        lines.pop();
    }
    if lines.is_empty() {
        return Err("empty CSV content".to_string());
    }

    let delim = if delimiter == "tab" { "\t" } else { delimiter };
    let mut start = 0;
    let mut columns: Vec<String> = Vec::new();
    if has_header {
        let header = lines[0];
        columns = header.split(delim).map(|s| s.trim().trim_matches('"').to_string()).collect();
        start = 1;
    } else {
        let first = lines[0];
        for (i, _) in first.split(delim).enumerate() {
            columns.push(format!("col_{}", i + 1));
        }
    }

    let mut rows: Vec<Vec<Value>> = Vec::new();
    let col_count = columns.len();
    for line in lines.iter().skip(start) {
        let line = line.trim();
        if line.is_empty() { continue; }
        let parts: Vec<&str> = line.split(delim).collect();
        let mut row = Vec::new();
        for i in 0..col_count {
            let val = parts.get(i).map(|s| s.trim().trim_matches('"')).unwrap_or("");
            row.push(if val.is_empty() { Value::Null } else { json!(val) });
        }
        rows.push(row);
    }

    let row_count = rows.len();
    let preview: Vec<Vec<Value>> = rows.iter().take(10).cloned().collect();
    Ok(CvsImportResult { row_count, columns, rows, preview })
}

pub async fn save_csv_to_db(
    db_path: &str,
    table_name: &str,
    columns: &[String],
    rows: &[Vec<Value>],
) -> Result<usize, String> {
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("open db failed: {e}"))?;

    // Drop existing
    let _ = conn.execute(&format!("DROP TABLE IF EXISTS \"{}\"", table_name), []);

    // Create table
    let col_defs: Vec<String> = columns.iter().map(|c| format!("\"{}\" TEXT", c)).collect();
    let create_sql = format!("CREATE TABLE \"{}\" ({})", table_name, col_defs.join(", "));
    conn.execute(&create_sql, [])
        .map_err(|e| format!("create table failed: {e}"))?;

    // Insert rows
    let placeholders: Vec<String> = (0..columns.len()).map(|_| "?".to_string()).collect();
    let insert_sql = format!(
        "INSERT INTO \"{}\" ({}) VALUES ({})",
        table_name,
        columns.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", "),
        placeholders.join(", ")
    );

    let mut count = 0;
    for row in rows {
        let params: Vec<rusqlite::types::Value> = row.iter().map(|v| match v {
            Value::String(s) => rusqlite::types::Value::Text(s.clone()),
            Value::Number(n) => rusqlite::types::Value::Text(n.to_string()),
            Value::Bool(b) => rusqlite::types::Value::Text(b.to_string()),
            _ => rusqlite::types::Value::Null,
        }).collect();
        if conn.execute(&insert_sql, rusqlite::params_from_iter(params.iter())).is_ok() {
            count += 1;
        }
    }
    Ok(count)
}

async fn scan_one_port(ip: String, port: u16, proto: String) -> ScanResultData {
    let addr = format!("{}:{}", ip, port);
    let start = std::time::Instant::now();
    let state: &str;
    let banner: Option<String>;

    match timeout(Duration::from_secs(3), TcpStream::connect(&addr)).await {
        Ok(Ok(stream)) => {
            state = "open";
            let mut buf = vec![0u8; 256];
            match tokio::time::timeout(Duration::from_secs(2), stream.readable()).await {
                Ok(Ok(())) => {
                    match stream.try_read(&mut buf) {
                        Ok(n) if n > 0 => banner = Some(String::from_utf8_lossy(&buf[..n]).trim().to_string()),
                        _ => banner = None,
                    }
                }
                _ => banner = None,
            }
        }
        Ok(Err(_)) => { state = "closed"; banner = None; }
        Err(_) => { state = "filtered"; banner = None; }
    }

    let elapsed = start.elapsed().as_millis();
    ScanResultData {
        ip,
        port: port as i64,
        protocol: proto,
        service: service_guess(port),
        state: state.to_string(),
        banner,
        elapsed_ms: elapsed as i64,
    }
}

pub async fn scan_ports(
    target: &str,
    ports_str: &str,
    scan_type: &str,
) -> Result<Vec<ScanResultData>, String> {
    let targets = expand_target(target)?;
    let ports = parse_ports(ports_str)?;
    let proto = if scan_type == "udp" { "udp" } else { "tcp" } .to_string();

    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(256));
    let mut handles = Vec::new();
    for ip in &targets {
        for &port in &ports {
            let ip = ip.clone();
            let proto = proto.clone();
            let sem = semaphore.clone();
            handles.push(tokio::spawn(async move {
                let _permit = sem.acquire().await.unwrap();
                scan_one_port(ip, port, proto).await
            }));
        }
    }

    let mut results = Vec::new();
    for handle in handles {
        match handle.await {
            Ok(result) => results.push(result),
            Err(e) => eprintln!("scan task failed: {e}"),
        }
    }

    results.sort_by(|a, b| a.ip.cmp(&b.ip).then(a.port.cmp(&b.port)));
    Ok(results)
}

#[derive(Clone, Serialize)]
pub struct ScanResultData {
    pub ip: String,
    pub port: i64,
    pub protocol: String,
    pub service: Option<String>,
    pub state: String,
    pub banner: Option<String>,
    pub elapsed_ms: i64,
}

fn expand_target(target: &str) -> Result<Vec<String>, String> {
    let mut ips = Vec::new();
    if target.contains('/') {
        // CIDR not supported in simple version, use the base IP
        let base = target.split('/').next().unwrap_or(target);
        ips.push(base.to_string());
    } else if target.contains('-') {
        let parts: Vec<&str> = target.split('-').collect();
        if parts.len() == 2 {
            let start_parts: Vec<&str> = parts[0].trim().split('.').collect();
            let end_num: u8 = parts[1].trim().parse().map_err(|_| "invalid range".to_string())?;
            if start_parts.len() == 4 {
                let base: Vec<u8> = start_parts.iter()
                    .filter_map(|s| s.parse::<u8>().ok())
                    .collect();
                if base.len() == 4 {
                    for i in base[3]..=end_num {
                        ips.push(format!("{}.{}.{}.{}", base[0], base[1], base[2], i));
                    }
                }
            }
        }
    } else {
        ips.push(target.to_string());
    }
    if ips.is_empty() { Err("no valid targets".to_string()) } else { Ok(ips) }
}

fn parse_ports(ports_str: &str) -> Result<Vec<u16>, String> {
    let mut ports = Vec::new();
    for part in ports_str.split(',') {
        let part = part.trim();
        if part.is_empty() { continue; }
        if part.contains('-') {
            let range: Vec<&str> = part.split('-').collect();
            if range.len() == 2 {
                let start: u16 = range[0].trim().parse().map_err(|_| "invalid port".to_string())?;
                let end: u16 = range[1].trim().parse().map_err(|_| "invalid port".to_string())?;
                for p in start..=end { ports.push(p); }
            }
        } else {
            let p: u16 = part.parse().map_err(|_| format!("invalid port: {part}"))?;
            ports.push(p);
        }
    }
    if ports.is_empty() { Err("no ports specified".to_string()) } else { Ok(ports) }
}

pub async fn start_auto_import(db: Arc<crate::db::AppDb>, interval_minutes: u64) {
    let interval = Duration::from_secs(interval_minutes * 60);
    loop {
        tokio::time::sleep(interval).await;
        let sources = match db.list_security_cvs_sources() {
            Ok(s) => s,
            Err(_) => continue,
        };
        for source in sources {
            if !source.auto_import { continue; }
            eprintln!("[auto-import] importing {} from {}", source.name, source.url);
            match download_and_parse_csv(&source.url, &source.delimiter, source.has_header).await {
                Ok(data) => {
                    let db_path = "kyklos.sqlite3";
                    if let Err(e) = save_csv_to_db(db_path, &source.table_name, &data.columns, &data.rows).await {
                        eprintln!("[auto-import] {} save failed: {}", source.name, e);
                    } else {
                        eprintln!("[auto-import] {} imported {} rows", source.name, data.row_count);
                    }
                }
                Err(e) => eprintln!("[auto-import] {} download failed: {}", source.name, e),
            }
        }
    }
}

pub async fn correlate_threats(db_path: &str, task_id: i64) -> Result<Vec<Value>, String> {
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("open db failed: {e}"))?;
    // Get scan results for this task
    let mut stmt = conn.prepare(
        "SELECT r.ip, r.port, r.service, r.state FROM security_scan_results r WHERE r.task_id = ?1 AND r.state = 'open'"
    ).map_err(|e| format!("prepare scan results query failed: {e}"))?;
    let scan_rows: Vec<(String, i64, Option<String>, String)> = stmt.query_map(params![task_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, Option<String>>(2)?, row.get::<_, String>(3)?))
    }).map_err(|e| format!("query scan results failed: {e}"))?.filter_map(|r| r.ok()).collect();

    // Get all CVS import tables
    let mut sources = conn.prepare("SELECT table_name FROM security_cvs_sources")
        .map_err(|e| format!("prepare sources query failed: {e}"))?;
    let table_names: Vec<String> = sources.query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("query sources failed: {e}"))?.filter_map(|r| r.ok()).collect();

    let mut correlations: Vec<Value> = Vec::new();
    for (ip, port, service, _state) in &scan_rows {
        let mut matched_sources: Vec<String> = Vec::new();
        for tbl in &table_names {
            let query = format!("SELECT COUNT(*) FROM \"{}\" WHERE (ip = ?1 OR ip LIKE ?2) AND (port = ?3 OR port IS NULL)", tbl);
            let ip_pattern = if let Some(prefix) = ip.rsplitn(2, '.').nth(1) {
                format!("{}.%", prefix)
            } else { String::new() };
            if let Ok(count) = conn.query_row(&query, params![ip, ip_pattern, port], |row| row.get::<_, i64>(0)) {
                if count > 0 { matched_sources.push(tbl.clone()); }
            }
        }
        if !matched_sources.is_empty() {
            correlations.push(json!({
                "ip": ip, "port": port, "service": service,
                "matched_sources": matched_sources
            }));
        }
    }
    Ok(correlations)
}

pub fn service_guess(port: u16) -> Option<String> {
    Some(match port {
        21 => "FTP".to_string(), 22 => "SSH".to_string(), 23 => "Telnet".to_string(),
        25 => "SMTP".to_string(), 53 => "DNS".to_string(), 80 => "HTTP".to_string(),
        110 => "POP3".to_string(), 143 => "IMAP".to_string(), 443 => "HTTPS".to_string(),
        465 => "SMTPS".to_string(), 587 => "SMTP-Submit".to_string(), 993 => "IMAPS".to_string(),
        995 => "POP3S".to_string(), 1433 => "MSSQL".to_string(), 1521 => "Oracle".to_string(),
        2049 => "NFS".to_string(), 2375 => "Docker".to_string(), 3306 => "MySQL".to_string(),
        3389 => "RDP".to_string(), 5432 => "PostgreSQL".to_string(), 5672 => "AMQP".to_string(),
        6379 => "Redis".to_string(), 8080 => "HTTP-Alt".to_string(), 8443 => "HTTPS-Alt".to_string(),
        27017 => "MongoDB".to_string(),
        _ => return None,
    })
}
