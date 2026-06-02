# pfctl 常用命令參考

本文整理了在 macOS 環境下使用 `pfctl`（Packet Filter）的常見命令、參數說明及典型使用場景，便於查詢與實踐。

## 1. 基礎概念

- **Anchor（錨點）**：pf 規則的邏輯分組概念，類似 iptables 的表+鏈組合，可用於模塊化管理規則集。
- **Table（表格）**：pf 中的高效地址集合，常用於白名單/黑名單，支援 IPv4/IPv6 混合。
- **Rule（規則）**：由匹配條件與動作組成，pf 規則按 `/etc/pf.conf` 中的順序由上而下執行。
- **動作（Action）**：`pass`（放行）、`block`（阻斷）、`match`（僅匹配不動作）、`scrub`（清理/正則化封包）。
- **方向（Direction）**：`in`（入站）、`out`（出站），pf 預設攔截所有流量，需明確設定 `pass` 規則。

macOS 的 pf 設定檔位於 `/etc/pf.conf`，pfctl 命令不支援按行號插入/刪除規則，所有變更須透過編輯設定檔後重新載入。

## 2. 命令結構

```bash
pfctl [參數] [選項]
```

常用全局選項：

| 參數 | 說明 |
| --- | --- |
| `-s` | 顯示資訊。搭配 `rules`、`nat`、`all`、` Anchors`、`Tables` 等子命令。 |
| `-f` | 載入指定設定檔（會覆蓋所有現有規則）。 |
| `-e` | 啟用封包過濾。 |
| `-d` | 停用封包過濾。 |
| `-N` | 不載入 NAT 規則（與 `-f` 搭配）。 |
| `-R` | 不載入過濾規則（與 `-f` 搭配）。 |
| `-a` | 指定 anchor。 |
| `-t` | 操作 table，搭配 `-T` 子命令。 |
| `-v` | 詳細輸出。 |

## 3. 常用命令速查

### 3.1 查看狀態與規則

```bash
# 查看所有過濾規則（含計數器）
pfctl -s rules -v

# 查看 NAT 規則
pfctl -s nat

# 查看全部資訊（規則、NAT、狀態、計數器）
pfctl -s all

# 查看特定 anchor 的規則
pfctl -s rules -a myanchor

# 查看 queue（佇列）統計
pfctl -s queue
```

### 3.2 啟用/停用防火牆

```bash
# 啟用 pf
sudo pfctl -e

# 停用 pf
sudo pfctl -d

# 重新載入設定檔
sudo pfctl -f /etc/pf.conf

# 檢查設定檔語法（不載入）
sudo pfctl -nf /etc/pf.conf
```

### 3.3 管理 Tables（地址集合）

```bash
# 查看所有 table 及其內容
pfctl -s tables
pfctl -t blacklist -T show

# 新增 address 到 table
pfctl -t blacklist -T add 10.0.0.1

# 從 table 移除 address
pfctl -t blacklist -T delete 10.0.0.1

# 批量載入 table 內容（每行一條）
pfctl -t whitelist -T load -f /etc/whitelist.txt

# 測試 address 是否在 table 中
pfctl -t blacklist -T test 10.0.0.1
```

### 3.4 查看連接狀態

```bash
# 查看狀態表（目前追蹤的連接）
pfctl -s state

# 查看詳細狀態
pfctl -s state -v

# 查看各類封包統計
pfctl -s info
```

## 4. pf.conf 規則語法速查

pf.conf 規則基本格式：

```
action [direction] [log] [quick] [on interface] [proto protocol] [from src_addr [port src_port]] [to dst_addr [port dst_port]] [flags tcp_flags] [stateful_options]
```

### 4.1 基本放行與阻斷

```pf
# 放行所有 loopback 流量
pass in quick on lo0 all

# 阻斷特定來源
block in quick from 10.0.0.0/8 to any

# 放行特定網段 SSH
pass in proto tcp from 192.168.1.0/24 to any port 22

# 阻斷所有入站（預設策略）
block in all
```

### 4.2 狀態追蹤（stateful）

```pf
# 放行已建立連接的回程流量（無需逐一開放高位埠）
pass out proto tcp all keep state
pass in proto tcp all modulate state

# 放行特定服務
pass in proto tcp to any port { 80, 443 } keep state
pass in proto tcp to any port 22 keep state
```

### 4.3 NAT / 端口轉發（rdr / nat）

```pf
# 內網 NAT 到公網 IP（類似 iptables MASQUERADE）
nat on en0 from 192.168.0.0/24 to any -> (en0)

# 端口轉發：外網 2222 → 內網 10.0.0.10:22
rdr pass on en0 proto tcp to any port 2222 -> 10.0.0.10 port 22

# 透明代理劫持 80 埠到本機 8080
rdr pass on lo0 proto tcp to any port 80 -> 127.0.0.1 port 8080
```

### 4.4 Table 整合

```pf
table <blacklist> persist
table <whitelist> persist file "/etc/whitelist.txt"

# 阻斷黑名單
block drop in quick from <blacklist> to any

# 放行白名單並記錄
pass in log quick from <whitelist> to any
```

### 4.5 LOG 記錄

```pf
# 記錄被阻斷的封包
block in log all

# 記錄特定規則的匹配
pass in log proto tcp to any port 22

# 配合 pflogd 查看日誌
# sudo tcpdump -r /var/log/pflog
```

### 4.6 速率限制 / 佇列

```pf
# 限制 ICMP 速率
pass in proto icmp all icmp-type echoreq

# 搭配 altq 進行頻寬管理（需驅動支援）
altq on en0 cbq bandwidth 100Mb queue { q_std, q_pri }
queue q_pri priority 7 bandwidth 40Mb cbq(default)
queue q_std priority 1 bandwidth 60Mb cbq(borrow)

pass in proto tcp to any port 80 queue q_std
pass in proto tcp to any port 443 queue q_pri
```

## 5. 場景示例

### 場景 A：僅允許特定網段 SSH

```
# /etc/pf.conf
block in all
pass out all keep state
pass in quick on lo0 all
pass in proto tcp from 192.168.1.0/24 to any port 22 keep state
```

```bash
sudo pfctl -f /etc/pf.conf
sudo pfctl -e
```

### 場景 B：macOS 共享 Internet（NAT）

```
# /etc/pf.conf
nat on en0 from 192.168.2.0/24 to any -> (en0)
pass in on en1 from 192.168.2.0/24 to any keep state
pass out on en0 from 192.168.2.0/24 to any keep state
```

且需啟用 IP forwarding：

```bash
sudo sysctl -w net.inet.ip.forwarding=1
```

### 場景 C：臨時阻斷惡意 IP

```bash
# 將 IP 加入黑名單
sudo pfctl -t blacklist -T add 203.0.113.55
sudo pfctl -t blacklist -T add 198.51.100.0/24

# 確認已加入
sudo pfctl -t blacklist -T show
```

需預先在 `/etc/pf.conf` 中定義 `table <blacklist> persist` 並重新載入一次：

```
table <blacklist> persist
block drop in quick from <blacklist> to any
```

### 場景 D：開發用開放全部埠

```bash
# 暫時放行全部流量（不建議生產使用）
echo "pass in all" | sudo pfctl -ef -
```

## 6. 故障排查建議

1. **權限不足**：所有 pfctl 操作需 `sudo`，確認使用者有 sudo 權限。
2. **載入失敗**：使用 `pfctl -nf /etc/pf.conf` 檢查語法錯誤，不要在生產環境中直接 `-f` 載入未驗證的規則。
3. **規則順序**：pf 規則按順序匹配，`quick` 關鍵字可中斷後續規則的評估。
4. **規則未生效**：確認 pf 已啟用（`pfctl -e`），並檢查是否有其他規則（如上層 anchor）優先匹配。
5. **還原預設**：macOS 預設 pf 規則為空（全部放行），可透過 `pfctl -f /etc/pf.conf` 還原，但 `/etc/pf.conf` 在 OS 更新時可能被覆蓋，建議備份。
6. **記錄檢視**：pf 日誌預設不輸出到系統日誌，需使用 `tcpdump -r /var/log/pflog` 或設定 `pflogd`。

## 7. macOS 特有注意事項

- macOS 的 pf 與 FreeBSD/OpenBSD 的 pf 在功能上略有差異，某些 OpenBSD 特有選項不支援。
- 系統偏好設定中的「防火牆」與 pf 是兩套獨立機制，同時啟用可能導致規則衝突。
- macOS 升級後 `/etc/pf.conf` 可能被覆寫，升級後需重新確認自訂規則。
- SIP（System Integrity Protection）會限制部分 pf 功能（如 `altq`），關閉 SIP 可能有安全風險。
- 使用 anchor 時請注意命名衝突，`com.apple.*` 等系統保留的 anchor 不應覆寫。

## 8. 進階閱讀

- `man pfctl` / `man pf.conf` / `man pf`
- `/etc/pf.conf`（macOS 預設設定檔）
- 實際開發中僅於 macOS 端支援 pfctl 命令，其特性與 pf on macOS 文件。
