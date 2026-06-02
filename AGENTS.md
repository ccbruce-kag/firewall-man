# AGENTS

## 專案定位

`89.MiCopa-firewall-man` 為 MiCopa 系統中的防火牆網頁管理工具，以 Rust 實作替代原 Golang 版本。
支援 **Linux (iptables)**、**macOS (pfctl)** 與 **Windows (PowerShell NetSecurity)** 三平台。

- 提供 Web GUI 管理防火牆規則。
- **Linux**：使用 **iptables / ip6tables** 後端。
- **macOS**：使用 **pfctl**（Packet Filter）後端。
- **Windows**：使用 **PowerShell NetSecurity 模組**（Get‑/New‑/Remove‑/Set‑NetFirewall*）後端。
- 支援 IPv4 / IPv6 雙協定操作（僅 Linux）。
- 內建 Basic Auth 認證與參數過濾防注入。
- 前端自動偵測平台，動態切換命令名稱與 UI 提示。

## 目錄結構

```
89.MiCopa-firewall-man/
├── Cargo.toml            # Rust 專案設定
├── build.rs              # 建置腳本（版本資訊）
├── src/
│   ├── main.rs           # 程式入口：CLI 參數、環境變數、平台偵測、初始化
│   ├── server.rs         # HTTP 路由、中間層、請求處理（通用 FirewallCmd trait）
│   ├── system.rs         # 系統資訊收集（hostname, memory, disk, process）
│   ├── firewall/
│   │   └── mod.rs        # FirewallCmd trait 定義（通用防火牆抽象介面）
│   ├── iptables/
│   │   ├── mod.rs        # 模組匯出 + FirewallCmd 實作
│   │   ├── types.rs      # 資料結構（SystemTitle, Column 等）
│   │   ├── table.rs      # iptables 輸出解析（regex）
│   │   └── iptable.rs    # iptables 命令執行 + FirewallCmd impl
│   ├── pfctl/
│   │   └── mod.rs        # pfctl 命令執行 + FirewallCmd impl（macOS）
│   ├── windows/
│   │   └── mod.rs        # PowerShell NetSecurity 命令執行 + FirewallCmd impl（Windows）
│   └── utils/
│       └── mod.rs        # 工具函式（JSON 輸出、字串處理）
├── web/                  # 前端靜態資源（index.html + sneat/ Bootstrap 5 UI）
├── docs/                 # 文件（命令參考 HTML / MD）
├── AGENTS.md
├── README.md
├── Makefile
├── Dockerfile
└── .gitignore
```

## 技術堆疊

| 層級 | 技術 |
|------|------|
| 語言 | Rust 2021 edition |
| Web 框架 | Axum 0.7 |
| 非同步 | Tokio (full features) |
| 序列化 | Serde + Serde JSON |
| 靜態資源嵌入 | Rust Embed |
| 正則表達式 | Regex |
| 前端 UI 框架 | Sneat Bootstrap 5 (Free) |
| 認證 | Basic Auth (Base64) |
| 抽象層 | `async-trait` (FirewallCmd) |
| 系統資訊收集 | `tokio::process::Command` shell 命令 |
| 前端 Logger | 內建 JavaScript logger 面板（debug/info/warn/error） |

## 架構設計

```
                    ┌──────────────┐
                    │  server.rs   │
                    │  (Arc<dyn    │
                    │   FirewallCmd>)│
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
     │  table.rs     │ │ 內建解析 │ │ 管線輸出解析 │
     │  regex 解析   │ │ 字串處理 │ │ 分隔符解析   │
     └───────────────┘ └─────────┘ └─────────────┘
```

- `FirewallCmd` trait 定義 11 個通用防火牆操作，三個後端各自實作。
- `server.rs` 透過 `Arc<dyn FirewallCmd>` 統一調度，無需關心底層實作。
- `main.rs` 於啟動時自動偵測作業系統（`linux` / `macos` / `windows`），選擇對應後端。
- 前端透過 `GET /platform` API 取得平台資訊，動態調整 UI 顯示的命令名稱與操作方式。

## 前端 Logger 機制

前端內建 Logger 面板，位於頁面底部（可折疊），用於追蹤所有操作步驟與 API 呼叫。

| 層級 | CSS 顏色 | 使用時機 |
|------|----------|----------|
| `debug` | 灰色 | 內部流程追蹤：載入規則、切換表格、API 回應、步驟完成 |
| `info` | 藍色 | 使用者觸發的操作：插入/追加/刪除規則、清空鏈、執行命令、匯入/匯出 |
| `warn` | 黃色 | 潛在問題或非預期回應 |
| `error` | 紅色 | API 錯誤、操作失敗 |

### Logger API

```javascript
logger.debug(msg, detail?)   // 內部流程
logger.info(msg, detail?)    // 使用者操作
logger.warn(msg, detail?)    // 警告
logger.error(msg, detail?)   // 錯誤
logger.clear()               // 清空
```

- 每條記錄包含時間戳、層級標籤、說明文字與可選的命令內容（以 `→` 標示）。
- 面板可透過頂部標題列點擊展開/折疊，按鈕計數器顯示累積條數。
- Clear 按鈕可清空所有記錄。

## System Status 系統現況

前端提供第三個切換視圖（System），透過 `GET /system/info` 與 `GET /system/processes` 兩支後端 API 取得系統資訊，需後端以 `tokio::process::Command` 執行 shell 命令並解析回傳。

### 後端 API

| API | 方法 | 回傳內容 |
|-----|------|----------|
| `/system/info` | GET | hostname, ip_addresses, os, uptime, memory (total/used/free), swap, disks (filesystem/mount/total/used/available/use_pct) |
| `/system/processes` | GET | process list (pid/name/cpu/mem/rss/state/path) |

實作於 `src/system.rs`，使用 `tokio::process::Command` 執行系統命令：
- **Linux**: `hostname`, `uptime -p`, `free -m`, `df -h`, `ps aux --sort=-%mem`, `/etc/os-release`
- **macOS**: `hostname`, `sysctl kern.boottime`, `vm_stat`, `sysctl hw.memsize`, `df -h`, `ps aux -r`, `sw_vers`
- **Windows**: 相同結構，命令待適配

### 前端功能

| 面板 | 內容 | 視覺化 |
|------|------|--------|
| System Info 卡片 | Hostname, OS, Uptime, IP | 文字卡片列 |
| Memory / Swap | 使用量條 + 數字 | 進度條 (綠/黃/紅三色) |
| Disk 表格 | Filesystem, Mount, Total, Used, Avail, Use% | 表格 + 小進度條 |
| Process 表格 | PID, Name, CPU%, MEM%, RSS, State, Path | 可排序表格 (按 MEM/CPU/PID/RSS) |

- Process 支援欄位排序，可點選表頭或下拉選單切換排序欄位。
- 所有資料透過 `$.get` 呼叫後端 API 取得，非即時輪詢。

## Dashboard 儀表板

前端提供 Dashboard 切換視圖（與 Tables 視圖互斥），透過 `GET /listRule` API 取得 iptables 規則計數資料，全部於客戶端彙總計算，**無需新增後端 API**。

### 功能面板

| 面板 | 內容 | 視覺化方式 |
|------|------|-----------|
| KPI 列 | 規則總數、鏈總數、封包總計、位元組總計 | 數字卡片 |
| Traffic Trend | 即時入站/出站封包速率趨勢（每 5 秒取樣，保留 120 筆） | Canvas 折線圖（`requestAnimationFrame` 動畫繪製） |
| Port Traffic In/Out | 對外開放埠號的入站 vs 出站封包量（依 INPUT/OUTPUT 鏈判斷方向） | 雙欄位表格（In/Out/Total） |
| Protocol Distribution | 協定分佈（tcp/udp/all…） | 環形圖（Conic Gradient） |
| Top Source IPs | 來源 IP 封包量排名（Top 8） | 表格 |
| Top Destination IPs | 目的 IP 封包量排名（Top 8） | 表格 |
| Target Distribution | 目標動作分佈（ACCEPT/DROP/REJECT…） | 環形圖 |
| Top Ports | 埠號封包量排名（Top 8，含常用服務名稱標註） | 表格 |

### 趨勢圖計算

iptables 計數器為累積值（系統開機至今），前端計算方式：

1. 每次取樣記錄累積 `inPkts` / `outPkts`
2. 與前次取樣相減得區間增量
3. 除以間隔秒數（5s）得 **每秒封包速率（pps）**
4. 以 Canvas 2D API 繪製，支援 `requestAnimationFrame` 漸進動畫

### 埠號方向判斷

| 鏈名稱 | 方向 | 解析欄位 |
|--------|------|----------|
| INPUT | 入站（Inbound） | `action` 中的 `dpt:`（目標埠） |
| OUTPUT | 出站（Outbound） | `action` 中的 `spt:`（來源埠） |
| FORWARD | 雙向 | 同時解析 `dpt:` 與 `spt:` |

### 自動更新

- 每 **5 秒** 自動向 `/listRule` 發送請求並重新繪製。
- 切換至 Tables 視圖時自動清除定時器；切回 Dashboard 時重新啟動。
- 請求中狀態鎖（`dashLoading` 旗標）防止重疊請求。
- 頁面底部 Logger 同步記錄每次更新。

### 資料來源

所有圖表資料來自 `listRule` API 回傳的 `Column` 結構：

| 圖表 | 使用欄位 |
|------|----------|
| KPI | `pkts`, `bytes`, chain/policy 計數 |
| Traffic by Chain | `pkts`, `bytes`（依 chain 分組加總） |
| Protocol | `prot` |
| Target | `target`（依 pkts 加權） |
| Source/Dest IP | `source`, `destination`（排除 `0.0.0.0/0`、`::/0`） |
| Ports | `action` 中以 `dpt:` 或 `dpt=` 擷取 |

### 計數器解析

iptables 輸出可能使用 `K`（千）、`M`（百萬）、`G`（十億）後綴，前端 `parseCounter()` 負責統一轉換為數值，`fmtNum()` 反向格式化顯示。

## 對應關係

| 概念 | Linux | macOS | Windows |
|------|-------|-------|---------|
| 後端模組 | `iptables/` | `pfctl/` | `windows/` |
| 執行命令 | `iptables` / `ip6tables` | `pfctl` | `powershell.exe -Command ...` |
| 規則查詢 | `iptables -t filter -nvL` | `pfctl -s rules -v` | `Get-NetFirewallRule` + 位址/埠過濾器 |
| 規則新增 | `iptables -t filter -I chain ...` | 透過 `pfctl -f` 載入檔案 | `New-NetFirewallRule ...` |
| 規則刪除 | `iptables -t filter -D chain id` | 不支援（pfctl 無行號） | `Remove-NetFirewallRule` |
| 匯出 | `iptables-save -t filter` | `pfctl -s all` | `Get-NetFirewallRule \| Format-List` |
| 匯入 | `iptables-restore < 暫存檔` | `pfctl -f 暫存檔` | 暫存 `.ps1` 以 `-File` 執行 |

## 整合約定

- API prefix 與原 Go 版本一致，無額外 prefix。
- 預設監聽 `:10001`，可透過 `-a` 參數或 `IPT_WEB_ADDRESS` 環境變數覆寫。
- 預設帳號密碼為 `admin / admin`，可透過 `-u` / `-p` 或環境變數設定。
- 前端 HTML/JS 與原版相容，API 回應格式保持 `{code, msg, data}` 結構。
- **跨平台支援**：Linux 使用 iptables，macOS 使用 pfctl，Windows 使用 PowerShell NetSecurity，啟動時自動偵測。
- 前端透過 `GET /platform` 取得平台類型，動態切換命令名稱與隱藏無關 UI 元素（如 macOS/Windows 隱藏 IPv4/IPv6 切換）。

## 開發

```bash
# 編譯
make release

# 執行（Linux / macOS 需 root / sudo 權限）
sudo ./target/release/firewall-man

# Windows 以系統管理員執行
.\target\release\firewall-man.exe

# 自訂監聽位址與認證
./firewall-man -a :8080 -u myuser -p mypass

# 測試
make test

# 程式碼檢查
make check

# Docker 映像 (僅限 Linux)
make images
```

> **注意**：macOS 上執行 pfctl 操作需要 `sudo` 權限；Windows 上執行 PowerShell NetSecurity cmdlet 需要系統管理員權限。
