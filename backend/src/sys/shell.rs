use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;

use crate::server::AppState;

/// Format raw keyboard bytes into a human-readable debug string.
/// Non-printable control chars are shown as named tokens (<CR>, <ESC>, <CTRL-0x03>, etc.)
#[allow(dead_code)]
#[inline]
fn format_shell_input_debug(data: &[u8]) -> String {
    data.iter()
        .map(|b| match *b {
            b'\r' => "<CR>".to_string(),
            b'\n' => "<LF>".to_string(),
            b'\t' => "<TAB>".to_string(),
            0x1b => "<ESC>".to_string(),
            0x7f => "<BACKSPACE>".to_string(),
            0x00..=0x1f => format!("<CTRL-{:#04x}>", b),
            0x20..=0x7e => (*b as char).to_string(),
            _ => format!("<0x{:02x}>", b),
        })
        .collect::<Vec<_>>()
        .join("")
}

pub async fn handle_ws_shell(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let platform = state.platform.clone();
    let shell = if platform == "macos" {
        "/bin/zsh"
    } else if platform == "windows" {
        "powershell.exe"
    } else {
        "/bin/bash"
    };
    tracing::info!(
        target: "shell",
        "Shell 連線請求: platform={platform} shell={shell}"
    );
    ws.on_upgrade(move |socket| {
        tracing::info!(
            target: "shell",
            "Shell WebSocket 升級完成: platform={platform} shell={shell}"
        );
        run_shell(socket, state)
    })
}

#[cfg(unix)]
async fn run_shell(socket: WebSocket, state: Arc<AppState>) {
    use nix::fcntl::OFlag;
    use nix::pty::{grantpt, posix_openpt, ptsname, unlockpt};
    use nix::sys::signal::Signal;
    use nix::sys::termios::{self, LocalFlags, SetArg};
    use nix::unistd::{close, dup2, execvp, fork, setsid, ForkResult};
    use std::ffi::CString;
    use std::os::fd::{AsRawFd, FromRawFd, IntoRawFd, RawFd};
    use tokio::io::unix::AsyncFd;

    let (mut sender, mut receiver) = socket.split();

    // Open PTY master
    let master_owned: nix::pty::PtyMaster = match posix_openpt(OFlag::O_RDWR | OFlag::O_NOCTTY) {
        Ok(fd) => fd,
        Err(e) => {
            let _ = sender
                .send(Message::Text(format!("PTY open error: {e}")))
                .await;
            return;
        }
    };
    if let Err(e) = grantpt(&master_owned) {
        let _ = sender
            .send(Message::Text(format!("grantpt error: {e}")))
            .await;
        return;
    }
    if let Err(e) = unlockpt(&master_owned) {
        let _ = sender
            .send(Message::Text(format!("unlockpt error: {e}")))
            .await;
        return;
    }
    let slave_name: String = match unsafe { ptsname(&master_owned) } {
        Ok(s) => s,
        Err(e) => {
            let _ = sender
                .send(Message::Text(format!("ptsname error: {e}")))
                .await;
            return;
        }
    };
    let slave_cstr = match CString::new(slave_name.as_bytes()) {
        Ok(s) => s,
        Err(e) => {
            let _ = sender
                .send(Message::Text(format!("cstring error: {e}")))
                .await;
            return;
        }
    };
    let slave_fd: RawFd =
        unsafe { nix::libc::open(slave_cstr.as_ptr(), nix::libc::O_RDWR | nix::libc::O_NOCTTY) };
    if slave_fd < 0 {
        let _ = sender
            .send(Message::Text(format!(
                "slave open error: {}",
                std::io::Error::last_os_error()
            )))
            .await;
        return;
    }

    // Set initial window size
    let ws = Winsize {
        ws_row: 24,
        ws_col: 80,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    unsafe {
        nix::libc::ioctl(slave_fd, nix::libc::TIOCSWINSZ as nix::libc::c_ulong, &ws);
    }

    // Enable echo and canonical mode on the slave terminal
    {
        let slave_file = unsafe { std::fs::File::from_raw_fd(slave_fd) };
        if let Ok(mut term) = termios::tcgetattr(&slave_file) {
            term.local_flags |= LocalFlags::ECHO | LocalFlags::ICANON | LocalFlags::IEXTEN;
            term.input_flags |= termios::InputFlags::ICRNL | termios::InputFlags::IXON;
            term.output_flags |= termios::OutputFlags::OPOST | termios::OutputFlags::ONLCR;
            let _ = termios::tcsetattr(&slave_file, SetArg::TCSANOW, &term);
        }
        std::mem::forget(slave_file);
    }

    // Determine shell
    let shell_path = if state.platform == "macos" {
        "/bin/zsh"
    } else {
        "/bin/bash"
    };
    let shell_argv: Vec<CString> = vec![
        CString::new(shell_path).unwrap(),
        CString::new("-i").unwrap(),
    ];

    // Fork: child execs shell with slave as controlling tty
    let pid = unsafe { fork() };
    let pid = match pid {
        Ok(p) => p,
        Err(e) => {
            let _ = sender.send(Message::Text(format!("fork error: {e}"))).await;
            return;
        }
    };

    match pid {
        ForkResult::Child => {
            tracing::debug!(target: "shell", "child: forked, pid={}", unsafe { nix::libc::getpid() });
            let setsid_ret = setsid();
            tracing::debug!(target: "shell", "child: setsid={}", setsid_ret.is_ok());
            let _ = setsid_ret;
            let _ = close(master_owned.as_raw_fd());
            let child_slave_fd: RawFd =
                unsafe { nix::libc::open(slave_cstr.as_ptr(), nix::libc::O_RDWR) };
            tracing::debug!(target: "shell", "child: reopen slave fd={}", child_slave_fd);
            if child_slave_fd >= 0 {
                tracing::debug!(target: "shell", "child: close inherited slave_fd={}", slave_fd);
                let _ = close(slave_fd);
            }
            let slave_fd = if child_slave_fd >= 0 {
                child_slave_fd
            } else {
                slave_fd
            };
            let sctty_ret = unsafe {
                nix::libc::ioctl(
                    slave_fd,
                    nix::libc::TIOCSCTTY as nix::libc::c_ulong,
                    0 as nix::libc::c_ulong,
                )
            };
            tracing::debug!(target: "shell", "child: TIOCSCTTY={}", sctty_ret);
            let d0 = dup2(slave_fd, 0);
            let d1 = dup2(slave_fd, 1);
            let d2 = dup2(slave_fd, 2);
            tracing::debug!(target: "shell", "child: dup2 0={:?} 1={:?} 2={:?}", d0, d1, d2);
            if slave_fd > 2 {
                let _ = close(slave_fd);
            }
            unsafe {
                nix::libc::setenv(
                    b"TERM\0".as_ptr() as *const _,
                    b"xterm-256color\0".as_ptr() as *const _,
                    1,
                );
                nix::libc::setenv(
                    b"COLORTERM\0".as_ptr() as *const _,
                    b"truecolor\0".as_ptr() as *const _,
                    1,
                );
                nix::libc::setenv(
                    b"ZSH_DISABLE_COMPFIX\0".as_ptr() as *const _,
                    b"true\0".as_ptr() as *const _,
                    1,
                );
            }
            tracing::debug!(target: "shell", "child: execvp {} ...", shell_path);
            let _ = execvp(&shell_argv[0], &shell_argv);
            tracing::error!(target: "shell", "child: execvp FAILED: {}", std::io::Error::last_os_error());
            eprintln!("exec failed: {}", std::io::Error::last_os_error());
            std::process::exit(1);
        }
        ForkResult::Parent { child: child_pid } => {
            tracing::info!(target: "shell", "parent: child pid={} master_raw={}", child_pid.as_raw(), master_owned.as_raw_fd());
            // Parent: close slave fd
            let _ = close(slave_fd);

            // Convert master fd to non-blocking and wrap in AsyncFd for readiness notifications
            let master_raw = master_owned.into_raw_fd();
            let flags = unsafe { nix::libc::fcntl(master_raw, nix::libc::F_GETFL) };
            if flags >= 0 {
                unsafe {
                    nix::libc::fcntl(
                        master_raw,
                        nix::libc::F_SETFL,
                        flags | nix::libc::O_NONBLOCK,
                    )
                };
            }
            let master_file = unsafe { std::fs::File::from_raw_fd(master_raw) };
            let async_master = match AsyncFd::new(master_file) {
                Ok(a) => a,
                Err(e) => {
                    let _ = sender
                        .send(Message::Text(format!("AsyncFd error: {e}")))
                        .await;
                    return;
                }
            };

            // Set initial window size on master
            let ws = Winsize {
                ws_row: 24,
                ws_col: 80,
                ws_xpixel: 0,
                ws_ypixel: 0,
            };
            unsafe {
                nix::libc::ioctl(master_raw, nix::libc::TIOCSWINSZ as nix::libc::c_ulong, &ws);
            }

            let mut buf_out = vec![0u8; 65536];
            tracing::debug!(target: "shell", "parent: entering main loop");

            loop {
                tokio::select! {
                    result = async_master.readable() => {
                        match result {
                            Ok(guard) => {
                                unsafe {
                                    let n = nix::libc::read(master_raw, buf_out.as_mut_ptr() as *mut _, buf_out.len());
                                    tracing::debug!(target: "shell", "parent: read n={}", n);
                                    match n {
                                        -1 => {
                                            let err = std::io::Error::last_os_error();
                                            if err.raw_os_error() == Some(35) || err.raw_os_error() == Some(11) {
                                                // EAGAIN / EWOULDBLOCK — spurious readiness, wait briefly before retrying
                                                drop(guard);
                                                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                                                tracing::debug!(target: "shell", "parent: read EAGAIN, retry after 10ms");
                                                continue;
                                            }
                                            tracing::warn!(target: "shell", "parent: read error: {err}");
                                            break;
                                        }
                                        0 => {
                                            tracing::warn!(target: "shell", "parent: read EOF (slave closed / shell exited)");
                                            break;
                                        }
                                        n => {
                                            drop(guard);
                                            if sender.send(Message::Binary(buf_out[..n as usize].to_vec())).await.is_err() {
                                                tracing::warn!(target: "shell", "parent: WebSocket send failed");
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::warn!(target: "shell", "parent: async_master.readable() error: {e}");
                                break;
                            }
                        }
                    }
                    msg = receiver.next() => {
                        match msg {
                            Some(Ok(Message::Binary(data))) => {
                                if let Ok(guard) = async_master.writable().await {
                                    let ret = unsafe { nix::libc::write(master_raw, data.as_ptr() as *const _, data.len()) };
                                    tracing::debug!(target: "shell", "parent: write ret={}", ret);
                                    drop(guard);
                                    if ret <= 0 { break; }
                                } else {
                                    tracing::warn!(target: "shell", "parent: write await failed");
                                    break;
                                }
                            }
                            Some(Ok(Message::Text(text))) => {
                                if text.starts_with("{\"type\":\"resize\"") {
                                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                                        let cols = parsed.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
                                        let rows = parsed.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
                                        let ws = Winsize { ws_row: rows, ws_col: cols, ws_xpixel: 0, ws_ypixel: 0 };
                                        unsafe { nix::libc::ioctl(master_raw, nix::libc::TIOCSWINSZ as nix::libc::c_ulong, &ws); }
                                        tracing::info!(target: "shell", "terminal resize: {cols}x{rows}");
                                    }
                                    continue;
                                }
                                if let Ok(guard) = async_master.writable().await {
                                    let ret = unsafe { nix::libc::write(master_raw, text.as_ptr() as *const _, text.len()) };
                                    tracing::debug!(target: "shell", "parent: write ret={}", ret);
                                    drop(guard);
                                    if ret <= 0 { break; }
                                } else {
                                    tracing::warn!(target: "shell", "parent: write await failed");
                                    break;
                                }
                            }
                            Some(Ok(Message::Close(_))) | None => {
                                tracing::debug!(target: "shell", "parent: WebSocket closed");
                                break;
                            }
                            _ => {}
                        }
                    }
                }
            }

            // Kill child if still running
            let pid = child_pid.as_raw();
            tracing::info!(target: "shell", "Shell session ending: pid={} closing", pid);
            let _ = unsafe { nix::libc::kill(pid, Signal::SIGTERM as i32) };
        }
    }
}

#[cfg(unix)]
#[repr(C)]
#[derive(Default, Debug, Clone, Copy)]
struct Winsize {
    ws_row: u16,
    ws_col: u16,
    ws_xpixel: u16,
    ws_ypixel: u16,
}

#[cfg(not(unix))]
async fn run_shell(socket: WebSocket, _state: Arc<AppState>) {
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
    use tokio::process::Command;
    tracing::info!(target: "shell", "Shell session starting (Windows/powershell)");
    let (mut sender, mut receiver) = socket.split();
    let mut child = match Command::new("powershell.exe")
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
    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let mut buf_out = vec![0u8; 65536];
    let mut buf_err = vec![0u8; 65536];
    loop {
        tokio::select! {
            biased;
            result = stdout.read(&mut buf_out) => {
                match result {
                    Ok(0) | Err(_) => break,
                    Ok(n) => { let _ = sender.send(Message::Binary(buf_out[..n].to_vec())).await; }
                }
            }
            result = stderr.read(&mut buf_err) => {
                match result {
                    Ok(0) | Err(_) => break,
                    Ok(n) => { let _ = sender.send(Message::Binary(buf_err[..n].to_vec())).await; }
                }
            }
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Binary(data))) => {
                        let _ = stdin.write_all(&data).await;
                    }
                    Some(Ok(Message::Text(text))) => {
                        let _ = stdin.write_all(text.as_bytes()).await;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }
    let _ = child.kill().await;
    let _ = child.wait().await;
    tracing::info!(target: "shell", "Shell session ended (Windows/powershell)");
}
