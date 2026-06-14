# Kyklos
Kyklos (Greek: Κύκλος) means “circle” or “cycle”, and in modern tech branding it is often interpreted as continuous flow, loop, and interconnected systems.

In the context of network servers and infrastructure, “Kyklos” can be applied as a conceptual architecture name for systems built around cyclic data flow, redundancy, and distributed networking.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

A Rust-based cross-platform firewall web management tool supporting **Linux (iptables)**, **macOS (pfctl)**, and **Windows (PowerShell NetSecurity)**.

<br/>
<p align="center"><img width="256" alt="rustoauth2" src="docs/logo.svg" /></p>
<br/>
## Features

- **Cross-platform**: Linux uses iptables/ip6tables, macOS uses pfctl, Windows uses PowerShell NetSecurity – auto-detected at startup
- **IPv4 / IPv6 Dual Stack**: Manage both IPv4 and IPv6 firewall rules (Linux only)
- **Platform-aware UI**: The frontend auto-detects the platform and dynamically switches command names and operation hints
- **Web GUI**: Sneat Bootstrap 5 responsive interface with intuitive table-based rule browsing and operations
- **Rule Management**: View, add, insert, delete, and flush rules
- **Counter Management**: Zero out rule or table statistics (iptables only)
- **Import / Export**: Batch import and export rules
- **Custom Commands**: Execute arbitrary firewall commands directly
- **Security**: HTTP Basic Auth with parameter injection filtering
- **Bilingual UI**: Traditional Chinese / English instant switch

## Quick Start

### Linux / macOS

```bash
# Build
cd backend && cargo build --release

# Run (requires root / sudo privileges)
sudo ./kyklos

# Custom listen address and credentials
./kyklos -a :8080 -u myuser -p mypass

# Using environment variables
export IPT_WEB_USERNAME=admin
export IPT_WEB_PASSWORD=secret
export IPT_WEB_ADDRESS=:10001
./kyklos
```

### Windows

```powershell
# Build
cd backend && cargo build --release

# Run (must run as Administrator)
.\kyklos.exe
```

After starting, open your browser and visit `http://<host-ip>:10001`.

## Platform Differences

| Feature | Linux (iptables) | macOS (pfctl) | Windows (PowerShell) |
|---------|------------------|---------------|----------------------|
| Rule List | Full Chain/Table structure | Simplified list display | All rules list |
| Add/Insert Rules | Supported | Supported (via exec) | Supported (via `New-NetFirewallRule`) |
| Delete Rule (by id) | Supported | Not supported | Supported (`Remove-NetFirewallRule`) |
| Flush Rules | Supported (by table/chain) | Single flush not supported | Batch flush not supported |
| Counter Zeroing | Supported | Not supported | Not supported |
| Empty Custom Chain Cleanup | Supported | Not supported | Not supported |
| Import/Export | iptables-save format | pfctl -s all format | PowerShell script format |
| Custom Commands | iptables commands | pfctl commands | PowerShell commands |

## Docker

```bash
docker build -t Miitai/kyklos:0.1.0 .
docker run -d --network host --privileged Miitai/kyklos:0.1.0
```

> Note: Requires `--privileged` or `CAP_NET_ADMIN` capability, otherwise firewall commands will be rejected.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/version` | Get firewall version |
| POST | `/listRule` | List rules (params: table, chain, protocol) |
| POST | `/listExec` | List raw commands (params: table, chain) |
| POST | `/flushRule` | Flush rules (params: table, chain; not supported on non-Linux) |
| POST | `/deleteRule` | Delete specific rule (params: table, chain, id; not supported on macOS) |
| POST | `/flushMetrics` | Zero counters (params: table, chain, id; Linux only) |
| POST | `/getRuleInfo` | Get single rule info (params: table, chain, id) |
| POST | `/flushEmptyCustomChain` | Flush empty custom chains (Linux only) |
| POST | `/export` | Export rules |
| POST | `/import` | Import rules (params: rule) |
| POST | `/exec` | Execute custom firewall command (params: args) |
| GET | `/` | Management interface home page |
| GET | `/platform` | Get current platform (linux / macos / windows) |
| GET | `/web/*path` | Static assets (Sneat Bootstrap 5 CSS/JS/fonts) |
| GET | `/docs/iptables-command-reference` | iptables command reference docs |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `IPT_WEB_USERNAME` | Login username | `admin` |
| `IPT_WEB_PASSWORD` | Login password | `admin` |
| `IPT_WEB_ADDRESS` | Listen address | `:10001` |

## CLI Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `-u` / `--username` | Login username | `admin` |
| `-p` / `--password` | Login password | `admin` |
| `-a` / `--address` | Listen address | `:10001` |

## Directory Structure

```
89.Miitai-firewall-admin/
├── Cargo.toml            # Rust project configuration
├── build.rs              # Build script (version info)
├── src/
│   ├── main.rs           # Entry point: CLI args, env vars, platform detection, initialization
│   ├── server.rs         # HTTP routing, middleware, request handling (generic FirewallCmd trait)
│   ├── system.rs         # System info collection (hostname, memory, disk, process)
│   ├── firewall/
│   │   └── mod.rs        # FirewallCmd trait definition
│   ├── iptables/
│   │   ├── mod.rs        # Module exports + FirewallCmd implementation for Linux
│   │   ├── types.rs      # Data structures (SystemTitle, Column, etc.)
│   │   ├── table.rs      # iptables output parsing (regex)
│   │   └── iptable.rs    # iptables command execution + FirewallCmd impl
│   ├── pfctl/
│   │   └── mod.rs        # pfctl command execution + FirewallCmd impl (macOS)
│   ├── windows/
│   │   └── mod.rs        # PowerShell NetSecurity command execution + FirewallCmd impl (Windows)
│   └── utils/
│       └── mod.rs        # Utility functions (JSON output, string processing)
├── web/                  # Frontend static assets (index.html + Sneat Bootstrap 5 UI)
├── docs/                 # Documentation (command reference HTML/MD)
├── AGENTS.md
├── README.md
├── Makefile
├── Dockerfile
└── .gitignore
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Rust 2021 edition |
| Web Framework | Axum 0.7 |
| Async Runtime | Tokio (full features) |
| Serialization | Serde + Serde JSON |
| Static Assets | Rust Embed |
| Regex | Regex |
| Frontend UI | Sneat Bootstrap 5 (Free) |
| Auth | Basic Auth (Base64) |
| Abstraction Layer | `async-trait` (FirewallCmd) |
| System Info | `tokio::process::Command` shell commands |
| Frontend Logger | Built-in JavaScript logger panel (debug/info/warn/error) |

## Architecture

```
                    ┌──────────────┐
                    │  server.rs   │
                    │  (Arc<dyn    │
                    │   FirewallCmd)│
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼──────┐ ┌──▼────────┐ ┌─▼───────────┐
     │  IptablesCmd  │ │ PfctlCmd  │ │ WindowsCmd  │
     │  (Linux)      │ │ (macOS)   │ │ (Windows)   │
     │  iptables /   │ │ pfctl     │ │ powershell  │
     │  ip6tables    │ │           │ │ NetSecurity │
     └───────────────┘ └───────────┘ └─────────────┘
              │              │              │
     ┌────────▼──────┐ ┌────▼────┐ ┌──────▼──────┐
     │  table.rs     │ │ Built-in│ │ Pipeline    │
     │  regex parse  │ │ string  │ │ output      │
     │               │ │ process │ │ delimiter   │
     └───────────────┘ └─────────┘ └─────────────┘
```

- The `FirewallCmd` trait defines 11 generic firewall operations, implemented by three backends.
- `server.rs` dispatches through `Arc<dyn FirewallCmd>`, independent of the underlying implementation.
- `main.rs` auto-detects the OS (`linux` / `macos` / `windows`) at startup and selects the corresponding backend.
- The frontend calls `GET /platform` to determine the platform and dynamically adjusts command names and UI hints.

## Development

```bash
# Compile
make release

# Run (Linux / macOS requires root / sudo)
sudo ./kyklos

# Windows: run as Administrator
.\kyklos.exe

# Custom listen address and credentials
./kyklos -a :8080 -u myuser -p mypass

# Test
make test

# Lint
make check

# Docker image (Linux only)
docker build -t Miitai/kyklos:0.1.0 .
```

> **Note**: macOS requires `sudo` for pfctl operations; Windows requires Administrator privileges for PowerShell NetSecurity cmdlets.

## Migration from Go Version

This project is a Rust port of [iptables-web](https://github.com/pretty66/iptables-web). See `AGENTS.md` for migration details.

## UI Reference

UI design based on [Sneat Bootstrap HTML Admin Template Free](https://github.com/themeselection/sneat-bootstrap-html-admin-template-free).

## License

Apache License 2.0
