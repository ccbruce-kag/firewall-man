use crate::db::{AppDb, CronJob, CronRunFinish};
use chrono::Utc;
use cron::Schedule;
use cron_tab::AsyncCron;
use rlua::Lua;
use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Instant;
use tokio::process::Command;
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};
use tracing::{error, info, warn};

#[derive(Clone)]
pub struct CronService {
    db: AppDb,
    cron: Arc<Mutex<AsyncCron<chrono::Utc>>>,
    runtime_ids: Arc<Mutex<HashMap<i64, usize>>>,
}

#[derive(Debug, Serialize)]
pub struct CronRunResult {
    pub run_id: i64,
    pub status: String,
    pub exit_code: Option<i64>,
    pub output: String,
    pub error: String,
    pub duration_ms: i64,
}

struct ExecutionResult {
    status: String,
    exit_code: Option<i64>,
    output: String,
    error: String,
}

impl CronService {
    pub fn new(db: AppDb) -> Self {
        Self {
            db,
            cron: Arc::new(Mutex::new(AsyncCron::new(Utc))),
            runtime_ids: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start(self: &Arc<Self>) -> Result<(), String> {
        {
            let mut cron = self.cron.lock().await;
            cron.start().await;
        }
        self.reload().await
    }

    pub async fn reload(self: &Arc<Self>) -> Result<(), String> {
        let jobs = self.db.list_enabled_cron_jobs()?;
        let mut cron = self.cron.lock().await;
        let mut runtime_ids = self.runtime_ids.lock().await;

        for runtime_id in runtime_ids.values().copied().collect::<Vec<_>>() {
            cron.remove(runtime_id).await;
        }
        runtime_ids.clear();

        for job in jobs {
            let schedule = match validate_schedule(&job.schedule) {
                Ok(_) => job.schedule.clone(),
                Err(err) => {
                    warn!("skip invalid cron job {}: {}", job.id, err);
                    let _ = self.db.update_cron_job_next_run(job.id, None);
                    continue;
                }
            };

            let next_run = next_run_at(&schedule);
            let _ = self
                .db
                .update_cron_job_next_run(job.id, next_run.as_deref());

            let service = Arc::clone(self);
            let job_id = job.id;
            let runtime_id = cron
                .add_fn(&schedule, move || {
                    let service = Arc::clone(&service);
                    async move {
                        if let Err(err) = service.run_job(job_id).await {
                            error!("cron job {} failed: {}", job_id, err);
                        }
                    }
                })
                .await
                .map_err(|e| format!("register cron job {} failed: {e}", job.id))?;
            runtime_ids.insert(job.id, runtime_id);
            info!("registered cron job {} as runtime {}", job.id, runtime_id);
        }

        Ok(())
    }

    pub async fn run_job(&self, job_id: i64) -> Result<CronRunResult, String> {
        let job = self
            .db
            .cron_job(job_id)?
            .ok_or_else(|| "cron job not found".to_string())?;
        if !job.enabled {
            return Err("cron job is disabled".to_string());
        }

        let run_id = self.db.create_cron_job_run(job.id)?;
        let started = Instant::now();
        let result = execute_job(job).await;
        let duration_ms = started.elapsed().as_millis() as i64;

        let finish = CronRunFinish {
            status: result.status.clone(),
            exit_code: result.exit_code,
            output: result.output.clone(),
            error: result.error.clone(),
            duration_ms,
        };
        self.db.finish_cron_job_run(run_id, finish)?;

        Ok(CronRunResult {
            run_id,
            status: result.status,
            exit_code: result.exit_code,
            output: result.output,
            error: result.error,
            duration_ms,
        })
    }
}

pub fn validate_schedule(schedule: &str) -> Result<(), String> {
    Schedule::from_str(schedule.trim())
        .map(|_| ())
        .map_err(|e| format!("invalid cron schedule: {e}"))
}

pub fn next_run_at(schedule: &str) -> Option<String> {
    Schedule::from_str(schedule.trim())
        .ok()
        .and_then(|schedule| schedule.upcoming(Utc).next())
        .map(|dt| dt.to_rfc3339())
}

async fn execute_job(job: CronJob) -> ExecutionResult {
    match job.executor.as_str() {
        "shell" => execute_shell(job).await,
        "rlua" => execute_rlua(job).await,
        other => ExecutionResult {
            status: "failed".to_string(),
            exit_code: None,
            output: String::new(),
            error: format!("unsupported executor: {other}"),
        },
    }
}

async fn execute_shell(job: CronJob) -> ExecutionResult {
    let mut command = if std::env::consts::OS == "windows" {
        let mut cmd = Command::new("powershell.exe");
        cmd.args(["-NoProfile", "-Command", &job.script]);
        cmd
    } else {
        let mut cmd = Command::new("/bin/sh");
        cmd.args(["-c", &job.script]);
        cmd
    };

    if !job.working_dir.trim().is_empty() {
        command.current_dir(job.working_dir.trim());
    }
    apply_env(&mut command, &job.env_json);
    command.stdin(Stdio::null());

    match timeout(
        Duration::from_secs(job.timeout_secs.max(1)),
        command.output(),
    )
    .await
    {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            ExecutionResult {
                status: if output.status.success() {
                    "success".to_string()
                } else {
                    "failed".to_string()
                },
                exit_code: output.status.code().map(i64::from),
                output: stdout,
                error: stderr,
            }
        }
        Ok(Err(err)) => ExecutionResult {
            status: "failed".to_string(),
            exit_code: None,
            output: String::new(),
            error: format!("shell execution failed: {err}"),
        },
        Err(_) => ExecutionResult {
            status: "timeout".to_string(),
            exit_code: None,
            output: String::new(),
            error: format!("job timed out after {} seconds", job.timeout_secs.max(1)),
        },
    }
}

async fn execute_rlua(job: CronJob) -> ExecutionResult {
    let script = job.script.clone();
    let timeout_secs = job.timeout_secs.max(1);
    match timeout(
        Duration::from_secs(timeout_secs),
        tokio::task::spawn_blocking(move || run_lua_script(&script)),
    )
    .await
    {
        Ok(Ok(Ok(output))) => ExecutionResult {
            status: "success".to_string(),
            exit_code: Some(0),
            output,
            error: String::new(),
        },
        Ok(Ok(Err(err))) => ExecutionResult {
            status: "failed".to_string(),
            exit_code: Some(1),
            output: String::new(),
            error: err,
        },
        Ok(Err(err)) => ExecutionResult {
            status: "failed".to_string(),
            exit_code: None,
            output: String::new(),
            error: format!("lua task join failed: {err}"),
        },
        Err(_) => ExecutionResult {
            status: "timeout".to_string(),
            exit_code: None,
            output: String::new(),
            error: format!("rlua job timed out after {timeout_secs} seconds"),
        },
    }
}

fn run_lua_script(script: &str) -> Result<String, String> {
    let lua = Lua::new();
    let output = std::rc::Rc::new(std::cell::RefCell::new(String::new()));
    let output_for_log = output.clone();

    {
        let log = lua
            .create_function(move |_, message: String| {
                let mut out = output_for_log.borrow_mut();
                out.push_str(&message);
                out.push('\n');
                Ok(())
            })
            .map_err(|e| e.to_string())?;
        lua.globals().set("log", log).map_err(|e| e.to_string())?;
        lua.load(script).exec().map_err(|e| e.to_string())?;
    }

    let result = output.borrow().clone();
    Ok(result)
}

fn apply_env(command: &mut Command, env_json: &str) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(env_json) else {
        return;
    };
    let Some(map) = value.as_object() else {
        return;
    };
    for (key, value) in map {
        if key.trim().is_empty() {
            continue;
        }
        let value = value
            .as_str()
            .map(ToString::to_string)
            .unwrap_or_else(|| value.to_string());
        command.env(key, value);
    }
}
