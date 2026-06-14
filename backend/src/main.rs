mod ai;
mod apiman;
mod db;
mod dbman;
mod firewall;
mod haproxy;
mod iptables;
mod juniper;
mod netplan;
mod nginx;
mod pfctl;
mod security;
mod server;
mod shell;
mod system;
mod tools;
mod utils;
mod windows;

use crate::db::AppDb;
use crate::firewall::FirewallCmd;
use crate::haproxy::HaproxyClient;
use crate::iptables::IptablesCmd;
use crate::juniper::JuniperClient;
use crate::nginx::{NginxClient, NginxSettings};
use crate::pfctl::PfctlCmd;
use crate::server::{build_router, AppState};
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
    let mut address = String::from(":10002");

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
    let db = AppDb::from_env().unwrap_or_else(|e| panic!("database initialization failed: {}", e));
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

                let nginx_settings = db.nginx_settings().unwrap_or_else(|_| NginxSettings::default());
                let state = Arc::new(AppState {
                    ipv4,
                    ipv6,
                    username,
                    password,
                    platform: "linux".to_string(),
                    db: db.clone(),
                    juniper: Arc::new(JuniperClient::new(db.clone())),
                    haproxy: Arc::new(HaproxyClient::from_env()),
                    nginx: std::sync::Mutex::new(NginxClient::new(nginx_settings)),
                });

                // Background CVS auto-import every 60 minutes
                let db_auto = Arc::new(db.clone());
                tokio::spawn(async move { crate::security::start_auto_import(db_auto, 60).await; });

                let app = build_router(state);

                let addr: std::net::SocketAddr = address
                    .parse()
                    .unwrap_or_else(|_| ([0, 0, 0, 0], 10002).into());

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

                let nginx_settings = db.nginx_settings().unwrap_or_else(|_| NginxSettings::default());
                let state = Arc::new(AppState {
                    ipv4: Some(pf_shared.clone()),
                    ipv6: Some(pf_shared),
                    username,
                    password,
                    platform: "macos".to_string(),
                    db: db.clone(),
                    juniper: Arc::new(JuniperClient::new(db.clone())),
                    haproxy: Arc::new(HaproxyClient::from_env()),
                    nginx: std::sync::Mutex::new(NginxClient::new(nginx_settings)),
                });

                let db_auto = Arc::new(db.clone());
                tokio::spawn(async move { crate::security::start_auto_import(db_auto, 60).await; });

                let app = build_router(state);

                let addr: std::net::SocketAddr = address
                    .parse()
                    .unwrap_or_else(|_| ([0, 0, 0, 0], 10002).into());

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

                let nginx_settings = db.nginx_settings().unwrap_or_else(|_| NginxSettings::default());
                let state = Arc::new(AppState {
                    ipv4: Some(wf_shared.clone()),
                    ipv6: Some(wf_shared),
                    username,
                    password,
                    platform: "windows".to_string(),
                    db: db.clone(),
                    juniper: Arc::new(JuniperClient::new(db.clone())),
                    haproxy: Arc::new(HaproxyClient::from_env()),
                    nginx: std::sync::Mutex::new(NginxClient::new(nginx_settings)),
                });

                let db_auto = Arc::new(db.clone());
                tokio::spawn(async move { crate::security::start_auto_import(db_auto, 60).await; });

                let app = build_router(state);

                let addr: std::net::SocketAddr = address
                    .parse()
                    .unwrap_or_else(|_| ([0, 0, 0, 0], 10002).into());

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
