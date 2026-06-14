# Miitai 網路與安全工具管理平臺使用說明

本文面向需要部署和日常使用網路與安全工具管理平臺的管理員，介紹系統功能、安裝方式、配置方法以及 Web/REST 接口的基本操作流程。

## 1. 功能概覽

- **跨平台支援**：Linux（iptables/ip6tables）、macOS（pfctl）、Windows（PowerShell NetSecurity），啟動時自動偵測。
- **跨協議規則管理**（Linux）：同時封裝 `iptables` 與 `ip6tables`，在頁面上可隨時切換 IPv4/IPv6。
- **嵌入式 Web UI**：單一二進制內置靜態界面，可查看規則、插入/追加/刪除條目、刷新計數、導入導出等。
- **REST 接口**：所有頁面操作都由 HTTP 接口驅動，可以通過腳本調用。
- **命令執行助手**：提供對底層防火牆命令的封裝，支援批量刷新、查看原始執行語句等。
- **儀表板（Dashboard）**：即時流量趨勢圖、協定分佈、Top IP/Ports 排行，全客戶端計算。
- **系統現況**：主機資訊、記憶體/Swap 使用率、磁碟用量、處理程序列表。

## 2. 前置條件

| 條件              | 說明                                                           |
| ----------------- | -------------------------------------------------------------- |
| 操作系統          | Linux / macOS / Windows。                                      |
| 運行權限          | Linux/macOS：需 root 或 `sudo` 權限；Windows：系統管理員。      |
| 依賴命令（Linux） | `iptables`、`iptables-save`、`iptables-restore`（IPv6 同理）。 |
| 依賴命令（macOS） | `pfctl`（macOS 內建）。                                         |
| 依賴命令（Windows）| PowerShell NetSecurity 模組（Windows 內建）。                   |
| Rust 環境（編譯） | Rust 2021 edition（參見 `Cargo.toml`）。                        |

## 3. 部署方式

### 3.1 Docker 運行（推薦）

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

- `--privileged --net=host` 是為了讓容器具有操作宿主機防火牆的能力。
- `IPT_WEB_ADDRESS` 默認為 `:10001`（監聽全部網卡），也可以指定 `127.0.0.1:10001` 僅供本機訪問。
- 鏡像 tag 請根據發佈版本替換，若使用非官方 registry，請自行更改。

### 3.2 二進制部署

```bash
git clone &lt;repository-url&gt;
cd 89.Miitai-firewall-admin
make release   # 生成 ./kyklos
sudo ./kyklos -a :10001 -u admin -p admin
```

後臺運行可配合 `nohup`/`systemd`/`supervisor` 等工具。

## 4. 配置說明

| 參數       | CLI 標誌 | 環境變量           | 默認值   | 說明                |
| ---------- | -------- | ------------------ | -------- | ------------------- |
| 監聽地址   | `-a`     | `IPT_WEB_ADDRESS`  | `:10001` | HTTP 服務綁定地址。 |
| 登錄用戶名 | `-u`     | `IPT_WEB_USERNAME` | `admin`  | Basic Auth 用戶名。 |
| 登錄密碼   | `-p`     | `IPT_WEB_PASSWORD` | `admin`  | Basic Auth 密碼。   |

優先級：命令行參數 > 環境變量 > 默認值。所有接口都採用 Basic Auth 認證，請務必在生產環境中覆蓋默認憑據，並通過 HTTPS/反向代理保護流量。

## 5. 運行與監控

訪問 `http://<host>:10001`，瀏覽器會彈出 Basic Auth 彈窗。默認憑據 `admin/admin` 登錄後進入頁面。

- Linux 缺 iptables/ip6tables 時日誌會出現 `exec [...] err`，安裝對應套件即可。
- macOS 所有 pfctl 操作需 `sudo` 權限。
- Windows 需以系統管理員身分執行。

## 6. Web 界面操作指南

1. **協定切換**（僅 Linux）：頁面頂部 IPv4/IPv6 單選按鈕決定所有請求使用的協定。
2. **表/鏈瀏覽**（僅 Linux）：Tab 包含 `raw/mangle/nat/filter`。
3. **鏈操作按鈕**（各平台對應底層命令）：
   - `插入`：Linux 調用 `iptables -I`，macOS/Windows 不支援行號插入。
   - `添加`：Linux `-A`，macOS 透過 `pfctl -f`，Windows `New-NetFirewallRule`。
   - `清零計數`：Linux 執行 `-Z`，macOS/Windows 不支援。
   - `清空規則`：Linux 執行 `-F`，macOS 不支援鏈層級清空。
   - `刷新`：重新獲取該鏈的規則。
   - `查看命令`：顯示對應的防火牆命令輸出。
4. **全局操作**（右側浮動按鈕，僅 Linux 完整支援）：
   - 清空全表/當前表規則。
   - 清空自定義空鏈。
   - 清零計數（全部/當前表）。
   - 查看當前表命令。
   - 執行任意命令。
   - 導入/導出規則。
5. **儀表板**：切換至 Dashboard 可查看即時流量趨勢、協定分佈、Top IP/Ports。
6. **系統現況**：切換至系統現況可查看主機資訊、記憶體/Swap 使用率、磁碟用量、處理程序列表。

## 7. REST 接口速查

所有接口均需 Basic Auth，並接受一個可選的 `protocol` 參數（`ipv4`/`ipv6`，預設 `ipv4`，僅 Linux 有效）。

| 路徑                     | 方法    | 參數                   | 說明                                                              |
| ------------------------ | ------- | ---------------------- | ----------------------------------------------------------------- |
| `/version`               | GET     | -                      | 返回當前命令版本字串。                                            |
| `/platform`              | GET     | -                      | 返回平台類型（`linux` / `macos` / `windows`）。                   |
| `/listRule`              | POST    | `table`, `chain`       | 查詢鏈列表或單鏈規則。                                            |
| `/listExec`              | POST    | `table`, `chain`       | 返回防火牆命令輸出（iptables-save / pfctl / PowerShell）。         |
| `/flushRule`             | POST    | `table`, `chain`       | 清空指定表/鏈。Linux 完整支援，macOS/Windows 有限支援。            |
| `/flushMetrics`          | POST    | `table`, `chain`, `id` | 清空計數（僅 Linux）。                                            |
| `/deleteRule`            | POST    | `table`, `chain`, `id` | 刪除指定序號規則（僅 Linux）。                                    |
| `/getRuleInfo`           | POST    | `table`, `chain`, `id` | 返回規則內容。                                                    |
| `/flushEmptyCustomChain` | POST    | -                      | 刪除自定義空鏈（僅 Linux）。                                      |
| `/export`                | POST    | `table`, `chain`       | 導出規則文字。                                                    |
| `/import`                | POST    | `rule`                 | 導入規則文字。                                                    |
| `/exec`                  | POST    | `args`                 | 直接執行防火牆子命令。                                            |
| `/system/info`           | GET     | -                      | 系統資訊（hostname, IP, memory, disk, uptime, OS）。              |
| `/system/processes`      | GET     | -                      | 處理程序列表（PID, name, CPU%, MEM%, RSS, state, path）。          |

## 8. 常見問題

1. **Linux 提示 "ipv6 iptables not available"**：宿主機沒有 `ip6tables`，可忽略或安裝。
2. **macOS 規則修改未生效**：確認使用 `sudo pfctl -f` 重新載入，pf 不支援單條規則增刪。
3. **Windows 命令失敗**：確認以系統管理員身分執行 PowerShell。
4. **儀表板無資料**：Dashboard 需防火牆規則中有封包計數資料才會顯示圖表。
5. **系統現況 API 回傳空白**：確認主機有裝 `free`、`df`、`ps` 等標準工具（macOS 無需額外安裝）。

## 9. 進一步學習

- `docs/iptables-command-reference.{lang}.md`：Linux iptables 命令參考（支援 zh/en/ja）。
- `docs/pfctl-command-reference.{lang}.md`：macOS pfctl 命令參考（支援 zh/en/ja）。
- `docs/windows-firewall-command-reference.{lang}.md`：Windows PowerShell NetSecurity 命令參考（支援 zh/en/ja）。
- 語言切換由右上角按鈕循環切換 繁體中文 / English / 日本語，對應文件自動載入對應語言版本。
- `Makefile`：展示內置構建參數。
