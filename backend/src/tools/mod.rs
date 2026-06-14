use serde_json::{json, Value};
use tokio::process::Command;

async fn run(cmd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(cmd)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("exec {} failed: {}", cmd, e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = if stdout.trim().is_empty() { stderr } else { stdout };
    if combined.trim().is_empty() && !output.status.success() {
        return Err(format!("{} exited with code {}", cmd, output.status.code().unwrap_or(-1)));
    }
    Ok(combined)
}

pub async fn ping(host: &str, count: u32, timeout_secs: u32) -> Value {
    let platform = std::env::consts::OS;
    let count_s = count.to_string();
    let timeout_ms = (timeout_secs * 1000).to_string();
    let timeout_s = timeout_secs.to_string();
    let (cmd, args) = match platform {
        "windows" => ("ping", vec!["-n", &count_s, "-w", &timeout_ms, host]),
        "macos" => ("ping", vec!["-c", &count_s, "-t", &timeout_s, host]),
        _ => ("ping", vec!["-c", &count_s, "-W", &timeout_s, host]),
    };
    match run(cmd, &args).await {
        Ok(out) => json!({"output": out}),
        Err(e) => json!({"error": e}),
    }
}

pub async fn lsof(port: Option<u16>, _process: Option<&str>, protocol: Option<&str>) -> Value {
    let platform = std::env::consts::OS;
    match platform {
        "windows" => {
            let mut args: Vec<&str> = vec!["-NoProfile", "Get-NetConnection", "-State", "Established"];
            let port_s = port.map(|p| p.to_string());
            if let Some(ref ps) = port_s {
                args.push("-LocalPort");
                args.push(ps);
            }
            match run("powershell.exe", &args).await {
                Ok(out) => json!({"output": out}),
                Err(e) => json!({"error": e}),
            }
        }
        _ => {
            let mut args: Vec<String> = vec!["-i".to_string()];
            if let Some(proto) = protocol {
                if proto == "tcp" || proto == "udp" {
                    args.push(proto.to_string());
                }
            }
            if let Some(p) = port {
                args.push(format!(":{}", p));
            }
            let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            match run("lsof", &arg_refs).await {
                Ok(out) => json!({"output": out}),
                Err(e) => json!({"error": e}),
            }
        }
    }
}

pub async fn traceroute(host: &str, max_hops: u32) -> Value {
    let platform = std::env::consts::OS;
    let hops_s = max_hops.to_string();
    let (cmd, args) = match platform {
        "windows" => ("tracert", vec!["-h", &hops_s, host]),
        _ => ("traceroute", vec!["-m", &hops_s, host]),
    };
    match run(cmd, &args).await {
        Ok(out) => json!({"output": out}),
        Err(e) => json!({"error": e}),
    }
}

pub async fn nslookup(domain: &str, dns_server: Option<&str>) -> Value {
    let mut args: Vec<&str> = vec![domain];
    if let Some(dns) = dns_server {
        args.push(dns);
    }
    match run("nslookup", &args).await {
        Ok(out) => json!({"output": out}),
        Err(e) => json!({"error": e}),
    }
}

pub async fn ip_location(ip: &str) -> Value {
    let url = format!("http://ip-api.com/json/{}?fields=status,message,country,regionName,city,isp,org,as,query", ip);
    let output = Command::new("curl")
        .args(["-s", "-m", "10", &url])
        .output()
        .await;
    match output {
        Ok(out) if out.status.success() => {
            let body = String::from_utf8_lossy(&out.stdout).to_string();
            match serde_json::from_str::<Value>(&body) {
                Ok(data) => json!({"data": data}),
                Err(e) => json!({"error": format!("parse response failed: {e}"), "raw": body}),
            }
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            json!({"error": format!("curl failed: {stderr}")})
        }
        Err(e) => json!({"error": format!("curl exec failed: {e}")}),
    }
}

pub async fn ping_classc(network: &str, count: u32, timeout_secs: u32) -> Value {
    // Parse network prefix (e.g. "192.168.1" or "192.168.1.0")
    let prefix = network.trim_end_matches('0').trim_end_matches('.');

    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(50)); // max 50 concurrent
    let mut handles = Vec::new();

    for i in 1..=254 {
        let ip = format!("{}.{}", prefix, i);
        let sem = semaphore.clone();
        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();
            let start = std::time::Instant::now();
            let platform = std::env::consts::OS;
            let args: Vec<String> = match platform {
                "windows" => vec!["-n".to_string(), "1".to_string(), "-w".to_string(), "3000".to_string(), ip.clone()],
                "macos" => vec!["-c".to_string(), "1".to_string(), "-t".to_string(), "3".to_string(), ip.clone()],
                _ => vec!["-c".to_string(), "1".to_string(), "-W".to_string(), "3".to_string(), ip.clone()],
            };
            let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            let reachable = tokio::process::Command::new("ping")
                .args(&arg_refs)
                .output()
                .await
                .map(|o| o.status.success())
                .unwrap_or(false);
            let elapsed = start.elapsed().as_millis() as i64;
            json!({"ip": ip, "reachable": reachable, "elapsed_ms": elapsed})
        }));
    }

    let mut results: Vec<Value> = Vec::new();
    for handle in handles {
        if let Ok(result) = handle.await {
            results.push(result);
        }
    }
    results.sort_by(|a, b| {
        let a_ip = a["ip"].as_str().unwrap_or("");
        let b_ip = b["ip"].as_str().unwrap_or("");
        a_ip.cmp(b_ip)
    });
    json!({"results": results, "total": results.len(), "reachable": results.iter().filter(|r| r["reachable"].as_bool().unwrap_or(false)).count()})
}

pub async fn netstat(platform: &str) -> Value {
    let (cmd, args): (&str, Vec<&str>) = match platform {
        "windows" => ("netstat", vec!["-ano"]),
        "macos" => ("netstat", vec!["-an", "-p", "tcp", "-p", "udp"]),
        _ => {
            let ss_check = Command::new("sh")
                .args(["-c", "which ss 2>/dev/null"])
                .output()
                .await;
            let use_ss = ss_check.ok().map_or(false, |o| !o.stdout.is_empty());
            if use_ss {
                ("ss", vec!["-tulpn"])
            } else {
                ("netstat", vec!["-tulpn"])
            }
        }
    };
    match run(cmd, &args).await {
        Ok(out) => json!({"output": out, "command": cmd}),
        Err(e) => json!({"error": e}),
    }
}
