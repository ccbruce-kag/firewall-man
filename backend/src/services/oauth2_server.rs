use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;

use tracing::{error, info, warn};

const DEFAULT_PORT: &str = "8080";
const DEV_JWT_SECRET: &str = "kyklos-oauth2-dev-jwt-secret-change-in-production";

fn service_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/services/oauth2-server")
}

pub fn start_background_from_env() {
    if std::env::var("KYKLOS_OAUTH2_DISABLE")
        .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
    {
        info!("oauth2 server service disabled by KYKLOS_OAUTH2_DISABLE");
        return;
    }

    let dir = service_dir();
    let manifest = dir.join("Cargo.toml");
    let port = std::env::var("KYKLOS_OAUTH2_PORT")
        .or_else(|_| std::env::var("OAUTH2_SERVER_PORT"))
        .unwrap_or_else(|_| DEFAULT_PORT.to_string());

    thread::spawn(move || {
        if !manifest.exists() {
            error!("oauth2 server manifest not found: {}", manifest.display());
            return;
        }

        info!(
            "starting oauth2 server service on 127.0.0.1:{} from {}",
            port,
            dir.display()
        );

        let mut command = Command::new("cargo");
        command
            .arg("run")
            .arg("--manifest-path")
            .arg(&manifest)
            .arg("--no-default-features")
            .arg("--features")
            .arg("sqlx")
            .current_dir(&dir)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .env("OAUTH2_SERVER_PORT", &port);

        if std::env::var_os("OAUTH2_SERVER_HOST").is_none() {
            command.env("OAUTH2_SERVER_HOST", "127.0.0.1");
        }
        if std::env::var_os("OAUTH2_ALLOW_INSECURE_DEFAULTS").is_none() {
            command.env("OAUTH2_ALLOW_INSECURE_DEFAULTS", "1");
        }
        if std::env::var_os("OAUTH2_JWT_SECRET").is_none() {
            command.env("OAUTH2_JWT_SECRET", DEV_JWT_SECRET);
        }
        if std::env::var_os("OAUTH2_DATABASE_URL").is_none() {
            command.env("OAUTH2_DATABASE_URL", "sqlite:oauth2.db?mode=rwc");
        }

        match command.spawn() {
            Ok(mut child) => match child.wait() {
                Ok(status) if status.success() => {
                    warn!("oauth2 server service exited normally");
                }
                Ok(status) => {
                    error!("oauth2 server service exited with status: {}", status);
                }
                Err(err) => {
                    error!("failed to wait for oauth2 server service: {}", err);
                }
            },
            Err(err) => {
                error!("failed to start oauth2 server service: {}", err);
            }
        }
    });
}
