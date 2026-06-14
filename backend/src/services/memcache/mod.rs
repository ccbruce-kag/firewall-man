mod cmd;
mod lru;
mod parser;
mod server;
mod store;

use std::thread;

use tracing::{error, info};

const DEFAULT_PORT: u16 = 11211;
const DEFAULT_CAPACITY: usize = 64 * 1024 * 1024;

pub fn start_background_from_env() {
    let port = std::env::var("KYKLOS_MEMCACHE_PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(DEFAULT_PORT);
    let capacity = std::env::var("KYKLOS_MEMCACHE_MEMORY")
        .ok()
        .and_then(|v| parser::parse_size(&v))
        .unwrap_or(DEFAULT_CAPACITY);
    let verbose = std::env::var("KYKLOS_MEMCACHE_VERBOSE")
        .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false);

    thread::spawn(move || {
        info!(
            "starting memcache service on 0.0.0.0:{} with capacity {} bytes",
            port, capacity
        );
        if let Err(err) = server::start(port, capacity, verbose) {
            error!("memcache service stopped: {}", err);
        }
    });
}
