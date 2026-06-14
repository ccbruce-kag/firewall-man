use serde_json::{json, Value};
use ssh2::Sftp;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::time::Duration;

struct SftpSession {
    sess: ssh2::Session,
    sftp: Sftp,
}

fn connect(host: &str, port: u16, username: &str, password: &str) -> Result<SftpSession, String> {
    let addr = format!("{}:{}", host, port);
    let tcp = TcpStream::connect(&addr)
        .map_err(|e| format!("TCP connect failed: {}", e))?;
    tcp.set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| format!("set timeout failed: {}", e))?;
    tcp.set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| format!("set timeout failed: {}", e))?;

    let mut sess = ssh2::Session::new()
        .map_err(|e| format!("create session failed: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake()
        .map_err(|e| format!("SSH handshake failed: {}", e))?;
    sess.userauth_password(username, password)
        .map_err(|e| format!("authentication failed: {}", e))?;

    if !sess.authenticated() {
        return Err("authentication failed: wrong credentials or unsupported method".into());
    }

    let sftp = sess.sftp()
        .map_err(|e| format!("SFTP init failed: {}", e))?;

    Ok(SftpSession { sess, sftp })
}

fn mode_to_string(mode: i32) -> String {
    let mut s = String::new();
    s.push(if mode & 0o40000 != 0 { 'd' } else { '-' });
    s.push(if mode & 0o400 != 0 { 'r' } else { '-' });
    s.push(if mode & 0o200 != 0 { 'w' } else { '-' });
    s.push(if mode & 0o100 != 0 { 'x' } else { '-' });
    s.push(if mode & 0o040 != 0 { 'r' } else { '-' });
    s.push(if mode & 0o020 != 0 { 'w' } else { '-' });
    s.push(if mode & 0o010 != 0 { 'x' } else { '-' });
    s.push(if mode & 0o004 != 0 { 'r' } else { '-' });
    s.push(if mode & 0o002 != 0 { 'w' } else { '-' });
    s.push(if mode & 0o001 != 0 { 'x' } else { '-' });
    s
}

pub async fn list_directory(host: &str, port: u16, username: &str, password: &str, path: &str) -> Value {
    match tokio::task::spawn_blocking({
        let host = host.to_string();
        let user = username.to_string();
        let pass = password.to_string();
        let p = path.to_string();
        move || {
            let sess = connect(&host, port, &user, &pass)?;
            let clean_path = if p.is_empty() || p == "/" { "/" } else { &p };
            let entries = sess.sftp.readdir(Path::new(clean_path))
                .map_err(|e| format!("readdir failed: {}", e))?;
            let items: Vec<Value> = entries.into_iter().map(|(entry_path, stat)| {
                let name = entry_path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                let modified = stat.mtime
                    .map(|m| {
                        let dt = chrono::DateTime::from_timestamp(m as i64, 0);
                        dt.map(|d| d.format("%Y-%m-%d %H:%M:%S").to_string())
                            .unwrap_or_default()
                    })
                    .unwrap_or_default();
                json!({
                    "name": name,
                    "size": stat.size.unwrap_or(0),
                    "is_directory": stat.is_dir(),
                    "mode": mode_to_string(stat.perm.unwrap_or(0o644) as i32),
                    "modified": modified,
                })
            }).collect();
            Ok::<_, String>(items)
        }
    }).await {
        Ok(Ok(items)) => json!({"code": 0, "data": {"entries": items, "path": path}}),
        Ok(Err(e)) => json!({"code": 1, "msg": e}),
        Err(e) => json!({"code": 1, "msg": format!("task failed: {}", e)}),
    }
}

pub async fn download_file(host: &str, port: u16, username: &str, password: &str, path: &str) -> Result<Vec<u8>, String> {
    let host = host.to_string();
    let user = username.to_string();
    let pass = password.to_string();
    let p = path.to_string();

    tokio::task::spawn_blocking(move || {
        let sess = connect(&host, port, &user, &pass)?;
        let mut file = sess.sftp.open(Path::new(&p))
            .map_err(|e| format!("open file failed: {}", e))?;
        let mut data = Vec::new();
        file.read_to_end(&mut data)
            .map_err(|e| format!("read file failed: {}", e))?;
        Ok(data)
    }).await.map_err(|e| format!("task failed: {}", e))?
}

pub async fn upload_file(host: &str, port: u16, username: &str, password: &str, path: &str, data: &[u8]) -> Value {
    let host = host.to_string();
    let user = username.to_string();
    let pass = password.to_string();
    let p = path.to_string();
    let content = data.to_vec();

    let result = tokio::task::spawn_blocking(move || {
        let sess = connect(&host, port, &user, &pass)?;
        let mut file = sess.sftp.create(Path::new(&p))
            .map_err(|e| format!("create file failed: {}", e))?;
        file.write_all(&content)
            .map_err(|e| format!("write file failed: {}", e))?;
        Ok::<_, String>(())
    }).await;

    match result {
        Ok(Ok(_)) => json!({"code": 0, "msg": "upload ok"}),
        Ok(Err(e)) => json!({"code": 1, "msg": e}),
        Err(e) => json!({"code": 1, "msg": format!("task failed: {}", e)}),
    }
}

pub async fn create_directory(host: &str, port: u16, username: &str, password: &str, path: &str) -> Value {
    let host = host.to_string();
    let user = username.to_string();
    let pass = password.to_string();
    let p = path.to_string();

    let result = tokio::task::spawn_blocking(move || {
        let sess = connect(&host, port, &user, &pass)?;
        sess.sftp.mkdir(Path::new(&p), 0o755)
            .map_err(|e| format!("mkdir failed: {}", e))?;
        Ok::<_, String>(())
    }).await;

    match result {
        Ok(Ok(_)) => json!({"code": 0, "msg": "directory created"}),
        Ok(Err(e)) => json!({"code": 1, "msg": e}),
        Err(e) => json!({"code": 1, "msg": format!("task failed: {}", e)}),
    }
}

pub async fn remove_file(host: &str, port: u16, username: &str, password: &str, path: &str) -> Value {
    let host = host.to_string();
    let user = username.to_string();
    let pass = password.to_string();
    let p = path.to_string();

    let result = tokio::task::spawn_blocking(move || {
        let sess = connect(&host, port, &user, &pass)?;
        sess.sftp.unlink(Path::new(&p))
            .map_err(|e| format!("unlink failed: {}", e))?;
        Ok::<_, String>(())
    }).await;

    match result {
        Ok(Ok(_)) => json!({"code": 0, "msg": "file removed"}),
        Ok(Err(e)) => json!({"code": 1, "msg": e}),
        Err(e) => json!({"code": 1, "msg": format!("task failed: {}", e)}),
    }
}

pub async fn remove_directory(host: &str, port: u16, username: &str, password: &str, path: &str) -> Value {
    let host = host.to_string();
    let user = username.to_string();
    let pass = password.to_string();
    let p = path.to_string();

    let result = tokio::task::spawn_blocking(move || {
        let sess = connect(&host, port, &user, &pass)?;
        sess.sftp.rmdir(Path::new(&p))
            .map_err(|e| format!("rmdir failed: {}", e))?;
        Ok::<_, String>(())
    }).await;

    match result {
        Ok(Ok(_)) => json!({"code": 0, "msg": "directory removed"}),
        Ok(Err(e)) => json!({"code": 1, "msg": e}),
        Err(e) => json!({"code": 1, "msg": format!("task failed: {}", e)}),
    }
}
