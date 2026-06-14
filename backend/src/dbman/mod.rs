use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::process::Command;

const ENCRYPT_KEY: &str = "FwM@2024!DbM#Sec";

pub fn encrypt_password(password: &str) -> String {
    if password.is_empty() { return String::new(); }
    let key_bytes: Vec<u8> = ENCRYPT_KEY.bytes().cycle().take(password.len()).collect();
    let xored: Vec<u8> = password.bytes().zip(key_bytes).map(|(p, k)| p ^ k).collect();
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(&xored)
}

pub fn decrypt_password(encoded: &str) -> String {
    if encoded.is_empty() { return String::new(); }
    use base64::Engine;
    let decoded = match base64::engine::general_purpose::STANDARD.decode(encoded) {
        Ok(d) => d,
        Err(_) => return encoded.to_string(),
    };
    let key_bytes: Vec<u8> = ENCRYPT_KEY.bytes().cycle().take(decoded.len()).collect();
    decoded.into_iter().zip(key_bytes).map(|(b, k)| (b ^ k) as char).collect()
}

#[derive(Clone, Serialize, Deserialize)]
pub struct DbConnection {
    pub id: i64,
    pub name: String,
    pub db_type: String, // "sqlite" | "mysql" | "sqlserver"
    pub file_path: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database_name: Option<String>,
    pub trust_server_cert: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct DbConnectionInput {
    pub name: String,
    pub db_type: String,
    pub file_path: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database_name: Option<String>,
    pub trust_server_cert: Option<bool>,
}

#[derive(Clone, Serialize)]
pub struct TableInfo {
    pub name: String,
}

#[derive(Clone, Serialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub primary_key: bool,
}

#[derive(Clone, Serialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Value>>,
    pub row_count: usize,
    pub elapsed_ms: u128,
}

pub async fn test_sqlite(path: &str) -> Result<String, String> {
    let conn = rusqlite::Connection::open(path)
        .map_err(|e| format!("open sqlite failed: {e}"))?;
    let version: String = conn
        .query_row("SELECT sqlite_version()", [], |row| row.get(0))
        .map_err(|e| format!("query sqlite version failed: {e}"))?;
    Ok(version)
}

pub async fn list_sqlite_tables(path: &str) -> Result<Vec<TableInfo>, String> {
    let conn = rusqlite::Connection::open(path)
        .map_err(|e| format!("open sqlite failed: {e}"))?;
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .map_err(|e| format!("prepare query failed: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(TableInfo {
                name: row.get(0)?,
            })
        })
        .map_err(|e| format!("query tables failed: {e}"))?;
    let mut tables = Vec::new();
    for row in rows {
        tables.push(row.map_err(|e| format!("read table row failed: {e}"))?);
    }
    Ok(tables)
}

pub async fn get_sqlite_columns(path: &str, table: &str) -> Result<Vec<ColumnInfo>, String> {
    let conn = rusqlite::Connection::open(path)
        .map_err(|e| format!("open sqlite failed: {e}"))?;
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info(\"{}\")", table))
        .map_err(|e| format!("prepare pragma failed: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ColumnInfo {
                name: row.get(1)?,
                data_type: row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "TEXT".to_string()),
                nullable: row.get::<_, i64>(3)? == 0,
                primary_key: row.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|e| format!("query columns failed: {e}"))?;
    let mut cols = Vec::new();
    for row in rows {
        cols.push(row.map_err(|e| format!("read column row failed: {e}"))?);
    }
    Ok(cols)
}

pub async fn query_sqlite(path: &str, sql: &str) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();
    let conn = rusqlite::Connection::open(path)
        .map_err(|e| format!("open sqlite failed: {e}"))?;
    let mut stmt = conn.prepare(sql).map_err(|e| format!("prepare sql failed: {e}"))?;
    let col_count = stmt.column_count();
    let columns: Vec<String> = (0..col_count)
        .map(|i| stmt.column_name(i).unwrap_or("?").to_string())
        .collect();
    let rows = stmt
        .query_map([], |row| {
            let mut values = Vec::new();
            for i in 0..col_count {
                let val: rusqlite::types::Value = row.get::<_, rusqlite::types::Value>(i).unwrap_or(rusqlite::types::Value::Null);
                values.push(match val {
                    rusqlite::types::Value::Null => Value::Null,
                    rusqlite::types::Value::Integer(n) => json!(n),
                    rusqlite::types::Value::Real(f) => json!(f),
                    rusqlite::types::Value::Text(s) => json!(s),
                    rusqlite::types::Value::Blob(_) => json!("[BLOB]"),
                });
            }
            Ok(values)
        })
        .map_err(|e| format!("query failed: {e}"))?;
    let mut result_rows = Vec::new();
    for row in rows {
        result_rows.push(row.map_err(|e| format!("read row failed: {e}"))?);
    }
    let elapsed = start.elapsed().as_millis();
    let row_count = result_rows.len();
    Ok(QueryResult {
        columns,
        rows: result_rows,
        row_count,
        elapsed_ms: elapsed,
    })
}

pub async fn test_mysql(host: &str, port: u16, user: &str, pass: &str, db: &str) -> Result<String, String> {
    let pass_arg = if pass.is_empty() { String::new() } else { format!("-p{}", pass) };
    let output = Command::new("mysql")
        .args([
            "-h", host,
            "-P", &port.to_string(),
            "-u", user,
            &pass_arg,
            db,
            "-e", "SELECT VERSION()",
            "-N", "-s",
        ])
        .output()
        .await
        .map_err(|e| format!("mysql client failed: {e}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("mysql error: {err}"));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string().trim().to_string())
}

pub async fn test_sqlserver(host: &str, port: u16, user: &str, pass: &str, db: &str, trust_cert: bool) -> Result<String, String> {
    let trust = if trust_cert { "-C" } else { "" };
    let output = Command::new("sqlcmd")
        .args([
            "-S", &format!("{},{}", host, port),
            "-U", user,
            "-P", pass,
            "-d", db,
            trust,
            "-Q", "SELECT @@VERSION",
            "-h", "-1",
            "-W",
        ])
        .output()
        .await
        .map_err(|e| format!("sqlcmd failed: {e}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("sqlcmd error: {err}"));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string().trim().to_string())
}

pub async fn exec_cli_sql(db_type: &str, host: &str, port: u16, user: &str, pass: &str, database: &str, sql: &str, trust_cert: bool) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();
    match db_type {
        "mysql" => {
            let pass_arg = if pass.is_empty() { String::new() } else { format!("-p{}", pass) };
            let output = Command::new("mysql")
                .args([
                    "-h", host, "-P", &port.to_string(), "-u", user, &pass_arg, database,
                    "-e", sql, "--table",
                ])
                .output().await.map_err(|e| format!("mysql exec failed: {e}"))?;
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                return Err(format!("mysql error: {stderr}"));
            }
            let elapsed = start.elapsed().as_millis();
            Ok(parse_cli_table_output(&stdout, elapsed))
        }
        "sqlserver" => {
            let trust = if trust_cert { "-C" } else { "" };
            let output = Command::new("sqlcmd")
                .args([
                    "-S", &format!("{},{}", host, port),
                    "-U", user, "-P", pass, "-d", database,
                    trust, "-Q", sql, "-W",
                ])
                .output().await.map_err(|e| format!("sqlcmd exec failed: {e}"))?;
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                return Err(format!("sqlcmd error: {stderr}"));
            }
            let elapsed = start.elapsed().as_millis();
            Ok(parse_cli_table_output(&stdout, elapsed))
        }
        _ => Err("unsupported db type for CLI query".to_string()),
    }
}

pub async fn list_cli_tables(db_type: &str, host: &str, port: u16, user: &str, pass: &str, database: &str, trust_cert: bool) -> Result<Vec<TableInfo>, String> {
    let sql = match db_type {
        "mysql" => "SHOW TABLES",
        "sqlserver" => "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME",
        _ => return Err("unsupported db type".to_string()),
    };
    let result = exec_cli_sql(db_type, host, port, user, pass, database, sql, trust_cert).await?;
    Ok(result.rows.iter().map(|row| {
        let name = row.first().and_then(|v| v.as_str()).unwrap_or("?").to_string();
        TableInfo { name }
    }).collect())
}

pub async fn list_cli_columns(db_type: &str, host: &str, port: u16, user: &str, pass: &str, database: &str, table: &str, trust_cert: bool) -> Result<Vec<ColumnInfo>, String> {
    let sql = match db_type {
        "mysql" => format!("SHOW COLUMNS FROM `{}`", table),
        "sqlserver" => format!(
            "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMNPROPERTY(OBJECT_ID('{}'), COLUMN_NAME, 'IsIdentity') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{}' ORDER BY ORDINAL_POSITION",
            table, table
        ),
        _ => return Err("unsupported db type".to_string()),
    };
    let result = exec_cli_sql(db_type, host, port, user, pass, database, &sql, trust_cert).await?;
    let columns = match db_type {
        "mysql" => result.rows.iter().map(|row| ColumnInfo {
            name: row.get(0).and_then(|v| v.as_str()).unwrap_or("?").to_string(),
            data_type: row.get(1).and_then(|v| v.as_str()).unwrap_or("TEXT").to_string(),
            nullable: row.get(2).and_then(|v| v.as_str()) != Some("NO"),
            primary_key: row.get(3).and_then(|v| v.as_str()) == Some("PRI"),
        }).collect(),
        "sqlserver" => result.rows.iter().map(|row| ColumnInfo {
            name: row.get(0).and_then(|v| v.as_str()).unwrap_or("?").to_string(),
            data_type: row.get(1).and_then(|v| v.as_str()).unwrap_or("TEXT").to_string(),
            nullable: row.get(2).and_then(|v| v.as_str()) != Some("NO"),
            primary_key: row.get(3).and_then(|v| v.as_str()) != Some("0"),
        }).collect(),
        _ => vec![],
    };
    Ok(columns)
}

fn parse_cli_table_output(output: &str, elapsed_ms: u128) -> QueryResult {
    let mut lines: Vec<&str> = output.lines().collect();
    // Remove empty trailing lines
    while lines.last().map(|l| l.trim().is_empty()) == Some(true) {
        lines.pop();
    }
    if lines.len() < 3 {
        return QueryResult { columns: vec!["result".to_string()], rows: vec![], row_count: 0, elapsed_ms };
    }
    // Skip separator line (line 1)
    let header_line = lines[0];
    let columns: Vec<String> = header_line
        .split_whitespace()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();
    let mut rows = Vec::new();
    for line in lines.iter().skip(2) {
        let parts: Vec<&str> = line.split('\t').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
        if parts.is_empty() { continue; }
        let values: Vec<Value> = (0..columns.len())
            .map(|i| {
                parts.get(i).map(|s| {
                    if *s == "NULL" { Value::Null }
                    else { json!(s) }
                }).unwrap_or(Value::Null)
            })
            .collect();
        rows.push(values);
    }
    let row_count = rows.len();
    QueryResult { columns, rows, row_count, elapsed_ms }
}
