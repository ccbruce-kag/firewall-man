# iptables 常用命令參考

本文整理了在 Linux 環境下使用 `iptables`/`ip6tables` 的常見命令、參數說明以及典型使用場景，便於初學者查詢與實踐。

## 1. 基礎概念

- **表（Table）**：按功能劃分。常見的 `raw`（連接跟蹤前）、`mangle`（數據包修改）、`nat`（地址轉換）、`filter`（包過濾）。
- **鏈（Chain）**：數據包在每張表中的處理路徑，例如 `INPUT`、`OUTPUT`、`FORWARD`、`PREROUTING`、`POSTROUTING`。自定義鏈可由用戶創建。
- **規則（Rule）**：由匹配條件與目標動作組成，匹配順序從上到下執行。
- **目標（Target）**：動作，例如 `ACCEPT`、`DROP`、`REJECT`、`LOG`、`SNAT`、`DNAT` 等。

IPv6 使用 `ip6tables` 命令，語法與 IPv4 基本一致，僅在地址/模塊支持上存在差異。

## 2. 命令結構

```bash
iptables [-t 表] COMMAND [鏈] [匹配條件] [-j 目標]
```

常用全局選項：

| 參數 | 說明 |
| --- | --- |
| `-t` | 指定表，默認 `filter`。 |
| `-L` | 列出鏈規則，配合 `-n`（數字顯示）、`-v`（統計信息）、`--line-numbers`（顯示序號）。 |
| `-A` / `-I` / `-D` / `-R` | 分別表示追加、插入、刪除、替換。 |
| `-F` / `-Z` / `-X` | 清空規則、清零計數、刪除自定義鏈。 |
| `-P` | 設置鏈的默認策略（僅系統鏈）。 |
| `-j` | 指定目標動作。 |
| `-m` | 啟用匹配模塊，例如 `state`/`conntrack`/`limit` 等。 |

## 3. 常用命令速查

### 3.1 查看現有規則

```bash
iptables -L -n -v --line-numbers
iptables -t nat -L -n -v
ip6tables -t filter -L INPUT -n
```

### 3.2 設置默認策略

```bash
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT
```

### 3.3 允許 SSH / Web 等端口

```bash
iptables -A INPUT -p tcp --dport 22 -s 10.0.0.0/24 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -m state --state NEW -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -m state --state NEW -j ACCEPT
```

### 3.4 拒絕或限制流量

```bash
iptables -A INPUT -p tcp --dport 25 -j REJECT --reject-with icmp-port-unreachable
iptables -A INPUT -p tcp --dport 22 -m state --state NEW -m recent --set --name SSH
iptables -A INPUT -p tcp --dport 22 -m state --state NEW -m recent --update --seconds 60 --hitcount 5 --name SSH -j DROP
```

### 3.5 NAT / 端口轉發

```bash
# 內網訪問 Internet，使用 SNAT
iptables -t nat -A POSTROUTING -s 192.168.0.0/24 -o eth0 -j SNAT --to-source 203.0.113.10
# 動態地址環境（例如 PPPoE）可使用 MASQUERADE
iptables -t nat -A POSTROUTING -s 10.10.0.0/16 -o ppp0 -j MASQUERADE

# DNAT：將外網流量轉發至內網主機
iptables -t nat -A PREROUTING -d 203.0.113.10/32 -p tcp --dport 2222 -j DNAT --to-destination 192.168.0.10:22
iptables -A FORWARD -p tcp -d 192.168.0.10 --dport 22 -m state --state NEW,ESTABLISHED,RELATED -j ACCEPT
iptables -A FORWARD -p tcp -s 192.168.0.10 --sport 22 -m state --state ESTABLISHED -j ACCEPT
```

### 3.6 透明代理 / 端口劫持

```bash
# 將 80 端口流量轉交給本機 8080（如 HTTP 代理）
iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j REDIRECT --to-ports 8080
```

### 3.7 記錄與速率限制

```bash
iptables -A INPUT -p tcp --dport 22 -m limit --limit 3/min -j LOG --log-prefix "SSH attempt: "
iptables -A INPUT -p icmp -m limit --limit 1/s --limit-burst 5 -j ACCEPT
iptables -A INPUT -p icmp -j DROP
```

### 3.8 保存與恢復

```bash
iptables-save > /etc/iptables/rules.v4
ip6tables-save > /etc/iptables/rules.v6
iptables-restore < /etc/iptables/rules.v4
ip6tables-restore < /etc/iptables/rules.v6
```

## 4. 場景示例

### 場景 A：只允許特定網段訪問 SSH

```bash
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -s 192.168.1.0/24 -m state --state NEW -j ACCEPT
iptables -A INPUT -j LOG --log-prefix "DROP INPUT: "
```

### 場景 B：雙網卡網關的 SNAT 與防火牆

```bash
# 開啟內核轉發
sysctl -w net.ipv4.ip_forward=1

# NAT 公網出口
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# 轉發策略
iptables -A FORWARD -i eth1 -o eth0 -m state --state NEW,ESTABLISHED,RELATED -j ACCEPT
iptables -A FORWARD -i eth0 -o eth1 -m state --state ESTABLISHED,RELATED -j ACCEPT

# 阻斷外網主動訪問內網
iptables -A FORWARD -i eth0 -o eth1 -j DROP
```

### 場景 C：IPv6 入站僅開放 80/443

```bash
ip6tables -P INPUT DROP
ip6tables -P FORWARD DROP
ip6tables -P OUTPUT ACCEPT
ip6tables -A INPUT -i lo -j ACCEPT
ip6tables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
ip6tables -A INPUT -p tcp --dport 80 -j ACCEPT
ip6tables -A INPUT -p tcp --dport 443 -j ACCEPT
```

### 場景 D：限制單 IP 併發連接數

```bash
iptables -A INPUT -p tcp --syn --dport 80 -m connlimit --connlimit-above 50 --connlimit-mask 32 -j REJECT
```

## 5. 故障排查建議

1. **規則與 nftables 衝突**：在使用新內核時確認是否啟用了 `iptables-nft`，可通過 `iptables -V` 查看，必要時安裝 `iptables-legacy`。
2. **模塊不可用**：例如 `-m conntrack` 提示錯誤，需加載 `nf_conntrack` 模塊或安裝對應包。
3. **順序問題**：iptables 規則按順序匹配，建議使用 `--line-numbers` 查看並使用 `-I`/`-R` 調整。
4. **調試**：利用 `LOG` 目標輸出到 `dmesg`/`/var/log/messages`，協助定位被丟棄的數據包。
5. **持久化**：在系統重啟後需重新加載規則，建議配合 `iptables-save` + `systemd`/`/etc/rc.local` 或發行版提供的 `netfilter-persistent`。

## 6. 進階閱讀

- `man iptables` / `man ip6tables`
- `man iptables-extensions`
- Netfilter.org 官方文檔

結合 iptables-web，可以在圖形界面中執行上述命令、觀察效果並快速導出/導入規則，降低學習成本。
