use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

use crate::server::AppState;

pub async fn handle_ws_shell(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| run_shell(socket, state))
}

async fn run_shell(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    let (cmd, args) = shell_cmd(&state.platform);
    let mut child = match Command::new(&cmd)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("TERM", "xterm-256color")
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            let _ = sender
                .send(Message::Text(format!("spawn error: {e}")))
                .await;
            return;
        }
    };

    let mut child_stdin = child.stdin.take().unwrap();
    let mut child_stdout = child.stdout.take().unwrap();
    let mut child_stderr = child.stderr.take().unwrap();

    let mut buf_out = vec![0u8; 65536];
    let mut buf_err = vec![0u8; 65536];

    loop {
        tokio::select! {
            biased;
            result = child_stdout.read(&mut buf_out) => {
                match result {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if sender.send(Message::Binary(buf_out[..n].to_vec())).await.is_err() {
                            break;
                        }
                    }
                }
            }
            result = child_stderr.read(&mut buf_err) => {
                match result {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if sender.send(Message::Binary(buf_err[..n].to_vec())).await.is_err() {
                            break;
                        }
                    }
                }
            }
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Binary(data))) => {
                        if child_stdin.write_all(&data).await.is_err() { break; }
                        let _ = child_stdin.flush().await;
                    }
                    Some(Ok(Message::Text(_))) => {}
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }

    let _ = child.kill().await;
    let _ = child.wait().await;
}

fn shell_cmd(platform: &str) -> (&'static str, Vec<&'static str>) {
    if platform == "macos" {
        ("script", vec!["-q", "/dev/null", "zsh", "-i"])
    } else if platform == "windows" {
        ("powershell.exe", vec![])
    } else {
        ("script", vec!["-q", "-c", "bash -i", "/dev/null"])
    }
}
