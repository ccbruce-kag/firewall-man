mod firewall;
mod iptables;
mod pfctl;
mod server;
mod shell;
mod system;
mod utils;
mod windows;

use crate::firewall::FirewallCmd;
use crate::iptables::IptablesCmd;
use crate::pfctl::PfctlCmd;
use crate::server::{AppState, build_router};
use crate::windows::WindowsCmd;
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::info;

const BUILD_VERSION: &str = env!("CARGO_PKG_VERSION");
const BUILD_DATE: &str = include_str!(concat!(env!("OUT_DIR"), "/build-date.txt"));
const GIT_HASH: &str = env!("GIT_HASH");

#[derive(Debug)]
enum Platform {
    Linux,
    MacOS,
    Windows,
}

fn detect_platform() -> Platform {
    match std::env::consts::OS {
        "linux" => Platform::Linux,
        "macos" => Platform::MacOS,
        "windows" => Platform::Windows,
        os => panic!("Unsupported operating system: {}", os),
    }
}

fn main() {
    tracing_subscriber::fmt::init();

    let args: Vec<String> = std::env::args().collect();

    let mut username = String::from("admin");
    let mut password = String::from("admin");
    let mut address = String::from(":10001");

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "-u" | "--username" => {
                if i + 1 < args.len() {
                    username = args[i + 1].clone();
                    i += 1;
                }
            }
            "-p" | "--password" => {
                if i + 1 < args.len() {
                    password = args[i + 1].clone();
                    i += 1;
                }
            }
            "-a" | "--address" => {
                if i + 1 < args.len() {
                    address = args[i + 1].clone();
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }

    if let Ok(v) = std::env::var("IPT_WEB_USERNAME") {
        if !v.is_empty() {
            username = v;
        }
    }
    if let Ok(v) = std::env::var("IPT_WEB_PASSWORD") {
        if !v.is_empty() {
            password = v;
        }
    }
    if let Ok(v) = std::env::var("IPT_WEB_ADDRESS") {
        if !v.is_empty() {
            address = v;
        }
    }

    let platform = detect_platform();
    info!("detected platform: {:?}", platform);

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        match platform {
            Platform::Linux => {
                let ipv4 = match IptablesCmd::new_ipv4().version().await {
                    Ok(v) => {
                        info!("ipv4 iptables initialized: {}", v);
                        Some(Arc::new(IptablesCmd::new_ipv4()) as Arc<dyn FirewallCmd>)
                    }
                    Err(e) => {
                        panic!("ipv4 iptables not available: {}", e);
                    }
                };

                let ipv6 = match IptablesCmd::new_ipv6().version().await {
                    Ok(v) => {
                        info!("ipv6 iptables initialized: {}", v);
                        Some(Arc::new(IptablesCmd::new_ipv6()) as Arc<dyn FirewallCmd>)
                    }
                    Err(e) => {
                        tracing::warn!("init ipv6 iptables failed: {}", e);
                        None
                    }
                };

                let state = Arc::new(AppState {
                    ipv4,
                    ipv6,
                    username,
                    password,
                    platform: "linux".to_string(),
                });

                let app = build_router(state);

                let addr: std::net::SocketAddr = address
                    .parse()
                    .unwrap_or_else(|_| ([0, 0, 0, 0], 10001).into());

                info!("listen address: {}", addr);
                info!(
                    "Build Version: {}  Date: {}  Hash: {}",
                    BUILD_VERSION, BUILD_DATE, GIT_HASH
                );

                let listener = TcpListener::bind(addr).await.unwrap();
                axum::serve(listener, app).await.unwrap();
            }
            Platform::MacOS => {
                info!("initializing pfctl backend for macOS");

                let pf = PfctlCmd::new();
                match pf.version().await {
                    Ok(v) => info!("pfctl version: {}", v),
                    Err(e) => info!("pfctl available (version check: {})", e),
                }

                let pf_shared = Arc::new(pf) as Arc<dyn FirewallCmd>;

                let state = Arc::new(AppState {
                    ipv4: Some(pf_shared.clone()),
                    ipv6: Some(pf_shared),
                    username,
                    password,
                    platform: "macos".to_string(),
                });

                let app = build_router(state);

                let addr: std::net::SocketAddr = address
                    .parse()
                    .unwrap_or_else(|_| ([0, 0, 0, 0], 10001).into());

                info!("listen address: {}", addr);
                info!(
                    "Build Version: {}  Date: {}  Hash: {}",
                    BUILD_VERSION, BUILD_DATE, GIT_HASH
                );

                let listener = TcpListener::bind(addr).await.unwrap();
                axum::serve(listener, app).await.unwrap();
            }
            Platform::Windows => {
                info!("initializing Windows Firewall backend");

                let wf = WindowsCmd::new();
                match wf.version().await {
                    Ok(v) => info!("Windows Firewall initialized: {}", v),
                    Err(e) => info!("Windows Firewall available (version check: {})", e),
                }

                let wf_shared = Arc::new(wf) as Arc<dyn FirewallCmd>;

                let state = Arc::new(AppState {
                    ipv4: Some(wf_shared.clone()),
                    ipv6: Some(wf_shared),
                    username,
                    password,
                    platform: "windows".to_string(),
                });

                let app = build_router(state);

                let addr: std::net::SocketAddr = address
                    .parse()
                    .unwrap_or_else(|_| ([0, 0, 0, 0], 10001).into());

                info!("listen address: {}", addr);
                info!(
                    "Build Version: {}  Date: {}  Hash: {}",
                    BUILD_VERSION, BUILD_DATE, GIT_HASH
                );

                let listener = TcpListener::bind(addr).await.unwrap();
                axum::serve(listener, app).await.unwrap();
            }
        }
    });
}
