use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

pub async fn handle_ws_ai(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(run_ai)
}

async fn run_ai(socket: WebSocket) {
    let (mut sender, mut receiver) = socket.split();

    // Wait for the initial prompt from the client
    let prompt = match receiver.next().await {
        Some(Ok(Message::Text(text))) => text,
        Some(Ok(Message::Binary(data))) => match String::from_utf8(data) {
            Ok(s) => s,
            Err(e) => {
                let _ = sender
                    .send(Message::Text(format!("ERROR: invalid utf-8 prompt: {e}")))
                    .await;
                return;
            }
        },
        _ => return,
    };

    let prompt = prompt.trim();
    if prompt.is_empty() {
        let _ = sender
            .send(Message::Text("ERROR: empty prompt".into()))
            .await;
        return;
    }

    // Spawn `opencode run "<prompt>"` and stream its output
    let mut child = match Command::new("opencode")
        .arg("run")
        .arg(prompt)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            let _ = sender
                .send(Message::Text(format!(
                    "ERROR: failed to spawn opencode: {e} (請確認 opencode CLI 已安裝)"
                )))
                .await;
            return;
        }
    };

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let mut stdout_done = false;
    let mut stderr_done = false;
    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    // Stream stdout and stderr concurrently until both are EOF
    while !stdout_done || !stderr_done {
        tokio::select! {
            biased;
            line = stdout_reader.next_line(), if !stdout_done => {
                match line {
                    Ok(Some(line)) => {
                        let clean = strip_ansi(&line);
                        if sender.send(Message::Text(format!("OUT:{clean}"))).await.is_err() {
                            return;
                        }
                    }
                    _ => stdout_done = true,
                }
            }
            line = stderr_reader.next_line(), if !stderr_done => {
                match line {
                    Ok(Some(line)) => {
                        let clean = strip_ansi(&line);
                        if sender.send(Message::Text(format!("ERR:{clean}"))).await.is_err() {
                            return;
                        }
                    }
                    _ => stderr_done = true,
                }
            }
        }
    }

    // Wait for child to finish
    let exit_status = child.wait().await;

    match exit_status {
        Ok(status) if status.success() => {
            let _ = sender.send(Message::Text("DONE:0".into())).await;
        }
        Ok(status) => {
            let _ = sender
                .send(Message::Text(format!(
                    "DONE:{}",
                    status.code().unwrap_or(-1)
                )))
                .await;
        }
        Err(e) => {
            let _ = sender.send(Message::Text(format!("DONE:error:{e}"))).await;
        }
    }
}

/// Best-effort strip of ANSI escape codes from a string.
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // Skip the `[` and any parameter bytes (0x30-0x3F), intermediate bytes
            // (0x20-0x2F), then a final byte (0x40-0x7E).
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(&nc) = chars.peek() {
                    chars.next();
                    if (0x40..=0x7E).contains(&(nc as u32)) {
                        break;
                    }
                }
            } else if chars.peek() == Some(&']') {
                // OSC: skip until BEL or ESC\
                chars.next();
                while let Some(nc) = chars.next() {
                    if nc == '\x07' {
                        break;
                    }
                    if nc == '\x1b' && chars.peek() == Some(&'\\') {
                        chars.next();
                        break;
                    }
                }
            } else {
                // 2-byte escape; skip next
                chars.next();
            }
        } else {
            out.push(c);
        }
    }
    out
}
