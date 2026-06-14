# Miitai Firewall Management Platform User Guide

This guide is intended for administrators who need to deploy and use the firewall management platform on a daily basis. It covers the system features, installation methods, configuration, and basic operation procedures for both the Web UI and REST API.

## 1. Feature Overview

- **Cross-platform**: Linux (iptables/ip6tables), macOS (pfctl), Windows (PowerShell NetSecurity) – auto-detected at startup.
- **Dual-stack Rule Management** (Linux): Supports both `iptables` and `ip6tables`, with IPv4/IPv6 toggle on the web page.
- **Embedded Web UI**: A single binary with a built-in static interface for viewing rules, inserting/appending/deleting entries, refreshing counters, importing/exporting, and more.
- **REST API**: All page operations are driven by HTTP endpoints, enabling script-based automation.
- **Command Execution Helper**: Wraps underlying firewall commands with support for batch operations and raw command output viewing.
- **Dashboard**: Real-time traffic trend charts, protocol distribution, Top IP/Port rankings – all client-side computed.
- **System Status**: Host information, memory/Swap usage, disk usage, process list.

## 2. Prerequisites

| Condition | Description |
|-----------|-------------|
| Operating System | Linux / macOS / Windows |
| Runtime Privileges | Linux/macOS: root or `sudo`; Windows: Administrator |
| Required commands (Linux) | `iptables`, `iptables-save`, `iptables-restore` (same for ip6tables) |
| Required commands (macOS) | `pfctl` (built-in) |
| Required commands (Windows) | PowerShell NetSecurity module (built-in) |
| Rust environment (build) | Rust 2021 edition (see `Cargo.toml`) |

## 3. Deployment

### 3.1 Docker (Recommended)

```bash
docker run -d \
  --name iptables-web \
  --privileged=true \
  --net=host \
  -e IPT_WEB_USERNAME=admin \
  -e IPT_WEB_PASSWORD=admin \
  -e IPT_WEB_ADDRESS=:10001 \
  -p 10001:10001 \
  pretty66/iptables-web:latest
```

- `--privileged --net=host` grants the container the ability to manipulate the host's firewall.
- `IPT_WEB_ADDRESS` defaults to `:10001` (all interfaces); use `127.0.0.1:10001` for local-only access.
- Adjust the image tag according to the release version.

### 3.2 Binary Deployment

```bash
git clone <repository-url>
cd 89.Miitai-firewall-admin
cd backend && cargo build --release   # produces backend/target/release/firewall-man
sudo ./firewall-man -a :10001 -u admin -p admin
```

Use `nohup`/`systemd`/`supervisor` to run in the background.

## 4. Configuration

| Parameter | CLI Flag | Environment Variable | Default | Description |
|-----------|----------|---------------------|---------|-------------|
| Listen address | `-a` | `IPT_WEB_ADDRESS` | `:10001` | HTTP service binding address |
| Login username | `-u` | `IPT_WEB_USERNAME` | `admin` | Basic Auth username |
| Login password | `-p` | `IPT_WEB_PASSWORD` | `admin` | Basic Auth password |

Priority: command-line arguments > environment variables > defaults. All API endpoints use Basic Auth. In production, always override the default credentials and use HTTPS/reverse proxy to protect traffic.

## 5. Running & Monitoring

Visit `http://<host>:10001`. The browser will prompt for Basic Auth credentials. Use the default `admin`/`admin` to log in.

- If Linux is missing iptables/ip6tables, log output will show `exec [...] err` – install the corresponding package.
- On macOS, all pfctl operations require `sudo`.
- On Windows, run as Administrator.

## 6. Web UI Operations

1. **Protocol Toggle** (Linux only): IPv4/IPv6 radio buttons at the top of the page determine the protocol for all requests.
2. **Table/Chain Browsing** (Linux only): Tabs for `raw/mangle/nat/filter`.
3. **Chain Operation Buttons** (platform-dependent):
   - `Insert`: Linux calls `iptables -I`; macOS/Windows do not support line-number insertion.
   - `Add`: Linux `-A`; macOS via `pfctl -f`; Windows `New-NetFirewallRule`.
   - `Zero Counters`: Linux executes `-Z`; macOS/Windows not supported.
   - `Flush`: Linux executes `-F`; macOS does not support chain-level flush.
   - `Refresh`: Re-fetches rules for the current chain.
   - `View Command`: Displays the corresponding firewall command output.
4. **Global Operations** (right-side floating buttons, fully supported on Linux only):
   - Flush all rules / current table rules.
   - Flush empty custom chains.
   - Zero counters (all / current table).
   - View current table commands.
   - Execute arbitrary commands.
   - Import / export rules.
5. **Dashboard**: Switch to the Dashboard to view real-time traffic trends, protocol distribution, and Top IP/Ports.
6. **System Info**: Switch to the System Info view to view host information, memory/Swap usage, disk usage, and process list.

## 7. REST API Reference

All endpoints require Basic Auth and accept an optional `protocol` parameter (`ipv4`/`ipv6`, default `ipv4`, effective on Linux only).

| Path | Method | Parameters | Description |
|------|--------|-----------|-------------|
| `/version` | GET | - | Returns the current command version string |
| `/platform` | GET | - | Returns the platform type (`linux` / `macos` / `windows`) |
| `/listRule` | POST | `table`, `chain` | Query chain list or single chain rules |
| `/listExec` | POST | `table`, `chain` | Returns firewall command output (iptables-save / pfctl / PowerShell) |
| `/flushRule` | POST | `table`, `chain` | Flush specified table/chain. Full support on Linux, limited on macOS/Windows |
| `/flushMetrics` | POST | `table`, `chain`, `id` | Zero counters (Linux only) |
| `/deleteRule` | POST | `table`, `chain`, `id` | Delete rule by sequence number (Linux only; not supported on macOS) |
| `/getRuleInfo` | POST | `table`, `chain`, `id` | Returns rule content |
| `/flushEmptyCustomChain` | POST | - | Delete empty custom chains (Linux only) |
| `/export` | POST | `table`, `chain` | Export rules as text |
| `/import` | POST | `rule` | Import rules from text |
| `/exec` | POST | `args` | Execute firewall subcommand directly |
| `/system/info` | GET | - | System info (hostname, IP, memory, disk, uptime, OS) |
| `/system/processes` | GET | - | Process list (PID, name, CPU%, MEM%, RSS, state, path) |

## 8. FAQ

1. **Linux shows "ipv6 iptables not available"**: The host does not have `ip6tables` installed. This warning can be ignored, or install ip6tables to suppress it.
2. **macOS rule changes not taking effect**: Confirm you are using `sudo pfctl -f` to reload; pf does not support single-rule add/delete.
3. **Windows command fails**: Ensure you are running PowerShell as Administrator.
4. **Dashboard shows no data**: The Dashboard requires firewall rules to have packet counter data before charts will display.
5. **System info API returns empty**: Confirm the host has standard tools like `free`, `df`, `ps` installed (macOS has them built-in).

## 9. Further Reading

- `docs/iptables-command-reference.md` – Linux iptables command reference.
- `docs/pfctl-command-reference.md` – macOS pfctl command reference.
- `docs/windows-firewall-command-reference.md` – Windows PowerShell NetSecurity command reference.
- `Makefile` – Build parameters and targets.
