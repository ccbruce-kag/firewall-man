use serde_json::{json, Value};
use smb2::{connect, SmbClient};
use std::time::UNIX_EPOCH;

async fn get_client(host: &str, port: u16, username: &str, password: &str) -> Result<SmbClient, String> {
    let addr = format!("{}:{}", host, port);
    connect(&addr, username, password)
        .await
        .map_err(|e| format!("SMB connection failed: {}", e))
}

fn format_filetime(ft: &smb2::pack::FileTime) -> String {
    if let Some(st) = ft.to_system_time() {
        if let Ok(dur) = st.duration_since(UNIX_EPOCH) {
            let secs = dur.as_secs();
            let datetime = chrono::DateTime::from_timestamp(secs as i64, 0);
            if let Some(dt) = datetime {
                return dt.format("%Y-%m-%d %H:%M:%S").to_string();
            }
        }
    }
    String::new()
}

pub async fn list_shares(host: &str, port: u16, username: &str, password: &str) -> Value {
    let mut client = match get_client(host, port, username, password).await {
        Ok(c) => c,
        Err(e) => return json!({"code": 1, "msg": e}),
    };
    match client.list_shares().await {
        Ok(shares) => {
            let items: Vec<Value> = shares.into_iter().map(|s| {
                json!({"name": s.name, "comment": s.comment, "share_type": s.share_type})
            }).collect();
            json!({"code": 0, "data": {"shares": items}})
        }
        Err(e) => json!({"code": 1, "msg": format!("list shares failed: {}", e)}),
    }
}

pub async fn list_directory(host: &str, port: u16, username: &str, password: &str, share: &str, path: &str) -> Value {
    let mut client = match get_client(host, port, username, password).await {
        Ok(c) => c,
        Err(e) => return json!({"code": 1, "msg": e}),
    };
    let mut tree = match client.connect_share(share).await {
        Ok(t) => t,
        Err(e) => return json!({"code": 1, "msg": format!("connect share '{}' failed: {}", share, e)}),
    };
    let clean_path = if path.is_empty() || path == "/" { "" } else { path.trim_start_matches('/') };
    match client.list_directory(&mut tree, clean_path).await {
        Ok(entries) => {
            let items: Vec<Value> = entries.into_iter().map(|e| {
                json!({
                    "name": e.name,
                    "size": e.size,
                    "is_directory": e.is_directory,
                    "modified": format_filetime(&e.modified),
                })
            }).collect();
            json!({"code": 0, "data": {"entries": items, "path": clean_path}})
        }
        Err(e) => json!({"code": 1, "msg": format!("list directory failed: {}", e)}),
    }
}

pub async fn download_file(host: &str, port: u16, username: &str, password: &str, share: &str, path: &str) -> Result<Vec<u8>, String> {
    let mut client = get_client(host, port, username, password).await?;
    let mut tree = client.connect_share(share).await.map_err(|e| format!("connect share failed: {}", e))?;
    let clean_path = path.trim_start_matches('/');
    client.read_file(&mut tree, clean_path).await.map_err(|e| format!("read file failed: {}", e))
}

pub async fn upload_file(host: &str, port: u16, username: &str, password: &str, share: &str, path: &str, data: &[u8]) -> Value {
    let mut client = match get_client(host, port, username, password).await {
        Ok(c) => c,
        Err(e) => return json!({"code": 1, "msg": e}),
    };
    let mut tree = match client.connect_share(share).await {
        Ok(t) => t,
        Err(e) => return json!({"code": 1, "msg": format!("connect share failed: {}", e)}),
    };
    let clean_path = path.trim_start_matches('/');
    match client.write_file(&mut tree, clean_path, data).await {
        Ok(_) => json!({"code": 0, "msg": "upload ok"}),
        Err(e) => json!({"code": 1, "msg": format!("upload failed: {}", e)}),
    }
}

pub async fn create_directory(host: &str, port: u16, username: &str, password: &str, share: &str, path: &str) -> Value {
    let mut client = match get_client(host, port, username, password).await {
        Ok(c) => c,
        Err(e) => return json!({"code": 1, "msg": e}),
    };
    let mut tree = match client.connect_share(share).await {
        Ok(t) => t,
        Err(e) => return json!({"code": 1, "msg": format!("connect share failed: {}", e)}),
    };
    let clean_path = path.trim_start_matches('/');
    match client.create_directory(&mut tree, clean_path).await {
        Ok(_) => json!({"code": 0, "msg": "directory created"}),
        Err(e) => json!({"code": 1, "msg": format!("create directory failed: {}", e)}),
    }
}

pub async fn remove_file(host: &str, port: u16, username: &str, password: &str, share: &str, path: &str) -> Value {
    let mut client = match get_client(host, port, username, password).await {
        Ok(c) => c,
        Err(e) => return json!({"code": 1, "msg": e}),
    };
    let mut tree = match client.connect_share(share).await {
        Ok(t) => t,
        Err(e) => return json!({"code": 1, "msg": format!("connect share failed: {}", e)}),
    };
    let clean_path = path.trim_start_matches('/');
    match client.delete_file(&mut tree, clean_path).await {
        Ok(_) => json!({"code": 0, "msg": "file removed"}),
        Err(e) => json!({"code": 1, "msg": format!("remove failed: {}", e)}),
    }
}

pub async fn remove_directory(host: &str, port: u16, username: &str, password: &str, share: &str, path: &str) -> Value {
    let mut client = match get_client(host, port, username, password).await {
        Ok(c) => c,
        Err(e) => return json!({"code": 1, "msg": e}),
    };
    let mut tree = match client.connect_share(share).await {
        Ok(t) => t,
        Err(e) => return json!({"code": 1, "msg": format!("connect share failed: {}", e)}),
    };
    let clean_path = path.trim_start_matches('/').trim_end_matches('/');
    match client.delete_directory(&mut tree, clean_path).await {
        Ok(_) => json!({"code": 0, "msg": "directory removed"}),
        Err(e) => json!({"code": 1, "msg": format!("remove failed: {}", e)}),
    }
}
