use std::sync::Mutex;
use chrono::Local;
use serde_json::Value;

const MAX_ENTRIES: usize = 500;

struct LogEntry {
    timestamp: String,
    level: String,
    api: String,
    message: String,
    detail: String,
}

pub struct ApiLogger {
    entries: Mutex<Vec<LogEntry>>,
}

impl ApiLogger {
    pub const fn new() -> Self {
        ApiLogger {
            entries: Mutex::new(Vec::new()),
        }
    }

    pub fn log(&self, level: &str, api: &str, message: &str, detail: &str) {
        let mut entries = match self.entries.lock() {
            Ok(e) => e,
            Err(_) => return,
        };
        entries.push(LogEntry {
            timestamp: Local::now().format("%H:%M:%S%.3f").to_string(),
            level: level.to_string(),
            api: api.to_string(),
            message: message.to_string(),
            detail: detail.to_string(),
        });
        if entries.len() > MAX_ENTRIES {
            entries.remove(0);
        }
    }

    pub fn drain(&self) -> Vec<Value> {
        let mut entries = match self.entries.lock() {
            Ok(e) => e,
            Err(_) => return vec![],
        };
        let result: Vec<Value> = entries.drain(..).map(|e| {
            serde_json::json!({
                "t": e.timestamp,
                "l": e.level,
                "a": e.api,
                "m": e.message,
                "d": e.detail,
            })
        }).collect();
        result
    }
}

use std::sync::OnceLock;
static API_LOG: OnceLock<ApiLogger> = OnceLock::new();

pub fn global() -> &'static ApiLogger {
    API_LOG.get_or_init(|| ApiLogger::new())
}

#[macro_export]
macro_rules! bapi_log {
    ($level:expr, $api:expr, $msg:expr, $detail:expr) => {
        $crate::logger::global().log($level, $api, $msg, $detail)
    };
    ($level:expr, $api:expr, $msg:expr) => {
        $crate::logger::global().log($level, $api, $msg, "")
    };
}
