use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::server::AppState;

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
    ws.on_upgrade(move |socket| run_shell(socket, state))
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
    let ws = Winsize { ws_row: 24, ws_col: 80, ws_xpixel: 0, ws_ypixel: 0 };
    unsafe { nix::libc::ioctl(slave_fd, nix::libc::TIOCSWINSZ as nix::libc::c_ulong, &ws); }

    // Enable echo and canonical mode on the slave terminal
    {
        let slave_file = unsafe { std::fs::File::from_raw_fd(slave_fd) };
        if let Ok(mut term) = termios::tcgetattr(&slave_file) {
            term.local_flags |= LocalFlags::ECHO | LocalFlags::ICANON | LocalFlags::IEXTEN;
            term.input_flags |= termios::InputFlags::ICRNL | termios::InputFlags::IXON;
            term.output_flags |= termios::OutputFlags::OPOST | termios::OutputFlags::ONLCR;
            let _ = termios::tcsetattr(&slave_file, SetArg::TCSANOW, &term);
        }
        // Don't close slave_fd here — we still need it in the child branch
        std::mem::forget(slave_file);
    }

    // Determine shell. macOS defaults to zsh; Linux defaults to bash.
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
            // Child: become session leader, attach slave, exec shell
            let _ = setsid();
            // Close master in child
            let _ = close(master_owned.as_raw_fd());
            // Re-open the slave after setsid() without O_NOCTTY so macOS/zsh gets a
            // real controlling terminal. Reusing the parent's O_NOCTTY slave fd can
            // leave zsh without a usable tty for line editing/input on macOS.
            let child_slave_fd: RawFd = unsafe { nix::libc::open(slave_cstr.as_ptr(), nix::libc::O_RDWR) };
            if child_slave_fd >= 0 {
                let _ = close(slave_fd);
            }
            let slave_fd = if child_slave_fd >= 0 { child_slave_fd } else { slave_fd };
            unsafe {
                nix::libc::ioctl(
                    slave_fd,
                    nix::libc::TIOCSCTTY as nix::libc::c_ulong,
                    0 as nix::libc::c_ulong,
                );
            }
            // dup2 slave to stdin/stdout/stderr
            let _ = dup2(slave_fd, 0);
            let _ = dup2(slave_fd, 1);
            let _ = dup2(slave_fd, 2);
            if slave_fd > 2 {
                let _ = close(slave_fd);
            }
            // Set useful environment for the shell (via setenv to avoid race with parent)
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
            // exec shell
            let _ = execvp(&shell_argv[0], &shell_argv);
            eprintln!("exec failed: {}", std::io::Error::last_os_error());
            std::process::exit(1);
        }
        ForkResult::Parent { child: child_pid } => {
            // Parent: close slave fd (only child needs it)
            let _ = close(slave_fd);

            // Get the master fd for tokio
            let master_raw = master_owned.into_raw_fd();
            let master_file = unsafe { std::fs::File::from_raw_fd(master_raw) };
            let mut master = tokio::fs::File::from_std(master_file);

            // Set initial window size on master
            let ws = Winsize { ws_row: 24, ws_col: 80, ws_xpixel: 0, ws_ypixel: 0 };
            unsafe { nix::libc::ioctl(master.as_raw_fd(), nix::libc::TIOCSWINSZ as nix::libc::c_ulong, &ws); }

            let mut buf_out = vec![0u8; 65536];

            loop {
                tokio::select! {
                    biased;
                    result = master.read(&mut buf_out) => {
                        match result {
                            Ok(0) | Err(_) => break,
                            Ok(n) => {
                                if sender.send(Message::Binary(buf_out[..n].to_vec())).await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                    msg = receiver.next() => {
                        match msg {
                            Some(Ok(Message::Binary(data))) => {
                                tracing::debug!(
                                    target: "shell",
                                    "keyboard input binary len={} data={}",
                                    data.len(),
                                    format_shell_input_debug(&data)
                                );
                                if master.write_all(&data).await.is_err() { break; }
                                let _ = master.flush().await;
                            }
                            Some(Ok(Message::Text(text))) => {
                                if text.starts_with("{\"type\":\"resize\"") {
                                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                                        let cols = parsed.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
                                        let rows = parsed.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
                                        let ws = Winsize { ws_row: rows, ws_col: cols, ws_xpixel: 0, ws_ypixel: 0 };
                                        unsafe { nix::libc::ioctl(master.as_raw_fd(), nix::libc::TIOCSWINSZ as nix::libc::c_ulong, &ws); }
                                    }
                                    continue;
                                }
                                tracing::debug!(
                                    target: "shell",
                                    "keyboard input text len={} data={}",
                                    text.len(),
                                    format_shell_input_debug(text.as_bytes())
                                );
                                if master.write_all(text.as_bytes()).await.is_err() { break; }
                                let _ = master.flush().await;
                            }
                            Some(Ok(Message::Close(_))) | None => break,
                            _ => {}
                        }
                    }
                }
            }

            // Kill child if still running
            let _ = unsafe { nix::libc::kill(child_pid.as_raw(), Signal::SIGTERM as i32) };
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
    use tokio::process::Command;
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
                        tracing::debug!(
                            target: "shell",
                            "keyboard input binary len={} data={}",
                            data.len(),
                            format_shell_input_debug(&data)
                        );
                        let _ = stdin.write_all(&data).await;
                    }
                    Some(Ok(Message::Text(text))) => {
                        tracing::debug!(
                            target: "shell",
                            "keyboard input text len={} data={}",
                            text.len(),
                            format_shell_input_debug(text.as_bytes())
                        );
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
}
