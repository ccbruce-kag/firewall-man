use serde_json::{Map, Value};
use tokio::process::Command;

async fn run(cmd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(cmd)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("exec {} err: {}", cmd, e))?;
    if !output.status.success() {
        return Err(format!("{} failed", cmd));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn parse_df_line(line: &str) -> Option<Value> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 6 {
        return None;
    }
    let mut m = Map::new();
    m.insert("filesystem".into(), Value::String(parts[0].into()));
    m.insert("total".into(), Value::String(parts[1].into()));
    m.insert("used".into(), Value::String(parts[2].into()));
    m.insert("available".into(), Value::String(parts[3].into()));
    m.insert("use_pct".into(), Value::String(parts[4].into()));
    m.insert("mount".into(), Value::String(parts[5].into()));
    Some(Value::Object(m))
}

pub async fn get_system_info(platform: &str) -> Value {
    let mut info = Map::new();

    // Hostname
    let hostname = run("hostname", &[]).await.unwrap_or_default();
    info.insert(
        "hostname".into(),
        Value::String(hostname.trim().to_string()),
    );

    // Uptime
    let uptime = match platform {
        "macos" => {
            let out = run("sysctl", &["-n", "kern.boottime"])
                .await
                .unwrap_or_default();
            if let Some(sec) = out
                .split(|c: char| !c.is_ascii_digit())
                .find_map(|s| s.parse::<i64>().ok())
            {
                let up = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64
                    - sec;
                let d = up / 86400;
                let h = (up % 86400) / 3600;
                let m = (up % 3600) / 60;
                format!("{}d {}h {}m", d, h, m)
            } else {
                "N/A".into()
            }
        }
        _ => {
            let u = run("uptime", &["-p"]).await.unwrap_or_default();
            if !u.is_empty() {
                u
            } else {
                run("uptime", &[]).await.unwrap_or_default()
            }
        }
    };
    info.insert("uptime".into(), Value::String(uptime.trim().to_string()));

    // IP addresses
    let ips = match platform {
        "macos" => run("ifconfig", &[])
            .await
            .unwrap_or_default()
            .lines()
            .filter(|l| l.contains("inet ") && !l.contains("127.0.0.1"))
            .filter_map(|l| l.split_whitespace().nth(1))
            .map(|s| Value::String(s.to_string()))
            .collect(),
        _ => run("hostname", &["-I"])
            .await
            .unwrap_or_default()
            .split_whitespace()
            .filter(|s| !s.is_empty())
            .map(|s| Value::String(s.to_string()))
            .collect(),
    };
    info.insert("ip_addresses".into(), Value::Array(ips));

    // Memory (MB)
    let (mem_total, mem_used, mem_free) = match platform {
        "macos" => {
            let total = run("sysctl", &["-n", "hw.memsize"])
                .await
                .ok()
                .and_then(|s| s.trim().parse::<u64>().ok())
                .map(|b| b / 1048576)
                .unwrap_or(0);
            let pages = run("vm_stat", &[]).await.unwrap_or_default();
            let free_p = pages
                .lines()
                .find(|l| l.contains("Pages free"))
                .and_then(|l| l.split(':').nth(1))
                .and_then(|s| s.trim().split('.').next())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0);
            let active_p = pages
                .lines()
                .find(|l| l.contains("Pages active"))
                .and_then(|l| l.split(':').nth(1))
                .and_then(|s| s.trim().split('.').next())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0);
            let wired_p = pages
                .lines()
                .find(|l| l.contains("Pages wired down"))
                .and_then(|l| l.split(':').nth(1))
                .and_then(|s| s.trim().split('.').next())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0);
            let page_size = 16384u64; // macOS default page size
            let free_mb = (free_p * page_size) / 1048576;
            let used_mb = ((active_p + wired_p) * page_size) / 1048576;
            (total as u64, used_mb, free_mb)
        }
        _ => {
            let out = run("free", &["-m"]).await.unwrap_or_default();
            let line = out.lines().nth(1).unwrap_or("");
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                (
                    parts[1].parse().unwrap_or(0),
                    parts[2].parse().unwrap_or(0),
                    parts[3].parse().unwrap_or(0),
                )
            } else {
                (0, 0, 0)
            }
        }
    };
    let mut mem = Map::new();
    mem.insert("total".into(), Value::Number(mem_total.into()));
    mem.insert("used".into(), Value::Number(mem_used.into()));
    mem.insert("free".into(), Value::Number(mem_free.into()));
    mem.insert("unit".into(), Value::String("MB".into()));
    info.insert("memory".into(), Value::Object(mem));

    // Swap
    let (swap_total, swap_used, swap_free) = match platform {
        "macos" => {
            let out = run("sysctl", &["-n", "vm.swapusage"])
                .await
                .unwrap_or_default();
            let parts: Vec<&str> = out.split_whitespace().collect();
            if parts.len() >= 4 {
                let total = parts[0].replace("M", "").parse::<f64>().unwrap_or(0.0) as u64;
                let used = parts[2].replace("M", "").parse::<f64>().unwrap_or(0.0) as u64;
                (total, used, total.saturating_sub(used))
            } else {
                (0, 0, 0)
            }
        }
        _ => {
            let out = run("free", &["-m"]).await.unwrap_or_default();
            let line = out.lines().nth(2).unwrap_or("");
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                (
                    parts[1].parse().unwrap_or(0),
                    parts[2].parse().unwrap_or(0),
                    parts[3].parse().unwrap_or(0),
                )
            } else {
                (0, 0, 0)
            }
        }
    };
    let mut swap = Map::new();
    swap.insert("total".into(), Value::Number(swap_total.into()));
    swap.insert("used".into(), Value::Number(swap_used.into()));
    swap.insert("free".into(), Value::Number(swap_free.into()));
    swap.insert("unit".into(), Value::String("MB".into()));
    info.insert("swap".into(), Value::Object(swap));

    // Disks
    let disks: Vec<Value> = match platform {
        "macos" => {
            let out = run("df", &["-h"]).await.unwrap_or_default();
            out.lines().skip(1).filter_map(parse_df_line).collect()
        }
        _ => {
            let mut out = run(
                "df",
                &[
                    "-h",
                    "--exclude-type=tmpfs",
                    "--exclude-type=devtmpfs",
                    "--exclude-type=squashfs",
                ],
            )
            .await;
            if out.is_err() {
                out = run("df", &["-h"]).await;
            }
            out.unwrap_or_default()
                .lines()
                .skip(1)
                .filter_map(parse_df_line)
                .collect()
        }
    };
    info.insert("disks".into(), Value::Array(disks));

    // OS info
    let os = match platform {
        "macos" => run("sw_vers", &["-productVersion"])
            .await
            .map(|v| format!("macOS {}", v.trim()))
            .unwrap_or_else(|_| "macOS".into()),
        _ => {
            let out = run("cat", &["/etc/os-release"]).await.unwrap_or_default();
            let pretty = out
                .lines()
                .find(|l| l.starts_with("PRETTY_NAME="))
                .map(|l| {
                    l.trim_start_matches("PRETTY_NAME=")
                        .trim_matches('"')
                        .to_string()
                })
                .unwrap_or_default();
            if pretty.is_empty() {
                let uname = run("uname", &["-r"]).await.unwrap_or_default();
                let uname_trim = uname.trim().to_string();
                if !uname_trim.is_empty() {
                    format!("Linux {}", uname_trim)
                } else {
                    "Linux".into()
                }
            } else {
                pretty
            }
        }
    };
    info.insert("os".into(), Value::String(os));

    Value::Object(info)
}

pub async fn get_interfaces(platform: &str) -> Value {
    tracing::info!("get_interfaces[windows] called");
    let output = match platform {
        "macos" => {
            let out = run("ifconfig", &["-l"]).await;
            match &out {
                Ok(s) => tracing::info!("get_interfaces[macos]: ifconfig -l → {}", s.trim()),
                Err(e) => tracing::warn!("get_interfaces[macos] failed: {}", e),
            }
            out.unwrap_or_default()
        }
        "windows" => {
            let out = run(
                "powershell",
                &[
                    "-Command",
                    "Get-NetAdapter | Select-Object -ExpandProperty Name",
                ],
            )
            .await;
            match &out {
                Ok(s) => tracing::info!("get_interfaces[windows]: {}", s.trim()),
                Err(e) => tracing::warn!("get_interfaces[windows] failed: {}", e),
            }
            out.unwrap_or_default()
        }
        _ => {
            let mut out = run("ls", &["/sys/class/net"]).await;
            match &out {
                Ok(s) => tracing::info!("get_interfaces[linux] /sys/class/net → {}", s.trim()),
                Err(e) => {
                    tracing::warn!("get_interfaces[linux] /sys/class/net failed: {}", e);
                    out = run("ip", &["-o", "link", "show"]).await;
                    tracing::info!(
                        "get_interfaces[linux] ip link → {}",
                        out.as_deref().unwrap_or("(failed)").trim()
                    );
                }
            }
            out.unwrap_or_default()
        }
    };
    let names: Vec<Value> = output
        .split_whitespace()
        .filter(|s| !s.is_empty())
        .map(|s| Value::String(s.trim().to_string()))
        .collect();
    if names.is_empty() {
        tracing::info!("get_interfaces: no interfaces found");
    }
    Value::Array(names)
}

pub async fn get_processes(platform: &str) -> Value {
    let output = match platform {
        "macos" => run("ps", &["aux", "-r"]).await,
        _ => run("ps", &["aux", "--sort=-%mem"]).await,
    };
    let out = match output {
        Ok(s) => s,
        Err(_) => return Value::Array(vec![]),
    };

    let mut procs = Vec::new();
    // ps aux header: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
    for line in out.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 11 {
            continue;
        }
        let pid = parts[1].to_string();
        let cpu = parts[2].to_string();
        let mem = parts[3].to_string();
        let vsz = parts[4].to_string();
        let rss = parts[5].to_string();
        let state = parts[7].to_string();
        let cmd = parts[10..].join(" ");
        let path = cmd.split_whitespace().next().unwrap_or("").to_string();
        let name = path.rsplit('/').next().unwrap_or(&path).to_string();

        let mut p = serde_json::Map::new();
        p.insert("pid".into(), Value::String(pid));
        p.insert("name".into(), Value::String(name));
        p.insert("cpu".into(), Value::String(cpu));
        p.insert("mem".into(), Value::String(mem));
        p.insert("vsz".into(), Value::String(vsz));
        p.insert("rss".into(), Value::String(rss));
        p.insert("state".into(), Value::String(state));
        p.insert("path".into(), Value::String(path));
        procs.push(Value::Object(p));
    }
    Value::Array(procs)
}
