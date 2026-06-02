# Windows Firewall 常用命令參考

本文整理在 Windows 環境下使用 PowerShell NetSecurity 模組管理防火牆的常見命令、參數說明及典型使用場景。

## 1. 基礎概念

- **規則（Rule）**：Windows 防火牆以規則為單位，每條規則包含名稱、方向、動作、通訊協定、本機/遠端埠、IP 位址等屬性。
- **方向（Direction）**：`Inbound`（入站）、`Outbound`（出站）。
- **動作（Action）**：`Allow`（允許）、`Block`（阻斷）。
- **設定檔（Profile）**：`Domain`（網域）、`Private`（私人）、`Public`（公用）。
- **群組（Group）**：規則可歸屬於群組，方便批量管理（例如 `Windows 遠端管理`、`檔案與印表機共用`）。

Windows 防火牆管理主要透過 PowerShell 的 `NetSecurity` 模組，包含 `Get-/New-/Remove-/Set-/Copy-NetFirewallRule` 與 `Get-NetFirewallAddressFilter`、`Get-NetFirewallPortFilter` 等輔助 Cmdlet。

## 2. 命令結構

```powershell
# 基本語法
Get-NetFirewallRule [[-Name] <string[]>] [-Direction <Direction>] [-Action <Action>] [-Enabled <Enabled>] [-Profile <Profile>]
New-NetFirewallRule -DisplayName <string> -Direction <Direction> -Action <Action> [-LocalPort <port>] [-RemotePort <port>] [-Protocol <protocol>] [-RemoteAddress <address>]
Remove-NetFirewallRule [-DisplayName <string>] [-Name <string>]
Set-NetFirewallRule [-DisplayName <string>] [-NewDisplayName <string>] [-Action <Action>] [-LocalPort <port>]
```

## 3. 常用命令速查

### 3.1 查看現有規則

```powershell
# 列出所有防火牆規則
Get-NetFirewallRule | Format-Table -AutoSize

# 列出入站允許規則
Get-NetFirewallRule -Direction Inbound -Action Allow | Format-Table DisplayName, Direction, Action, Enabled

# 列出阻斷規則
Get-NetFirewallRule -Action Block | Format-Table DisplayName, Direction, Enabled

# 查看特定規則的詳細資訊
Get-NetFirewallRule -DisplayName "SSH" | Get-NetFirewallPortFilter
Get-NetFirewallRule -DisplayName "SSH" | Get-NetFirewallAddressFilter

# 查看啟用中的規則
Get-NetFirewallRule -Enabled True

# 依設定檔篩選（Domain / Private / Public）
Get-NetFirewallRule -Profile Domain
```

### 3.2 新增規則

```powershell
# 允許 TCP 埠 22 入站（SSH）
New-NetFirewallRule -DisplayName "SSH" -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow

# 允許 80 與 443 埠入站
New-NetFirewallRule -DisplayName "Web HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "Web HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

# 允許特定 IP 範圍的 RDP 連線
New-NetFirewallRule -DisplayName "RDP Restricted" -Direction Inbound -Protocol TCP -LocalPort 3389 -RemoteAddress 192.168.1.0/24 -Action Allow

# 允許程式出站
New-NetFirewallRule -DisplayName "MyApp Outbound" -Direction Outbound -Program "C:\Program Files\MyApp\myapp.exe" -Action Allow

# 新增阻斷規則（阻斷特定 IP 的所有入站）
New-NetFirewallRule -DisplayName "Block Malicious IP" -Direction Inbound -RemoteAddress 203.0.113.55 -Action Block

# 新增 ICMPv4 允許規則（讓別人可以 Ping 本機）
New-NetFirewallRule -DisplayName "ICMPv4 Allow" -Direction Inbound -Protocol ICMPv4 -IcmpType 8 -Action Allow
```

### 3.3 移除規則

```powershell
# 依顯示名稱刪除
Remove-NetFirewallRule -DisplayName "SSH"

# 依名稱刪除（Name 為 GUID 字串）
Remove-NetFirewallRule -Name "{GUID-HERE}"

# 刪除全部出站允許規則（請謹慎使用）
Get-NetFirewallRule -Direction Outbound -Action Allow | Remove-NetFirewallRule
```

### 3.4 修改現有規則

```powershell
# 停用規則
Disable-NetFirewallRule -DisplayName "SSH"

# 啟用規則
Enable-NetFirewallRule -DisplayName "SSH"

# 修改規則動作（Allow → Block）
Set-NetFirewallRule -DisplayName "SSH" -Action Block

# 修改規則的埠號
Set-NetFirewallRule -DisplayName "Web HTTP" -LocalPort 8080

# 修改規則的遠端位址
Set-NetFirewallRule -DisplayName "RDP Restricted" -RemoteAddress 10.0.0.0/8

# 複製規則
Copy-NetFirewallRule -DisplayName "Web HTTP" -NewDisplayName "Web HTTP Staging"
```

### 3.5 匯出與匯入

```powershell
# 匯出所有規則為 GPO 備份檔
$path = "C:\fw-backup.wfw"
Export-NetFirewallRule -PolicyFilePath $path
# 注意：此為 Windows 防火牆原則檔案，非純文字

# 從原則檔還原
Import-NetFirewallRule -PolicyFilePath "C:\fw-backup.wfw"

# 使用 PowerShell 匯出為可讀文字（非官方但實用）
Get-NetFirewallRule | Format-List > C:\fw-rules.txt
```

### 3.6 進階查詢與篩選

```powershell
# 查詢所有關聯的埠過濾器
Get-NetFirewallRule | Where { $_.Enabled -eq $true } | Get-NetFirewallPortFilter

# 查詢所有關聯的位址過濾器
Get-NetFirewallRule | Get-NetFirewallAddressFilter | Where { $_.RemoteAddress -ne "Any" }

# 查找特定埠的規則
Get-NetFirewallPortFilter | Where { $_.LocalPort -eq 443 } | ForEach { Get-NetFirewallRule -Name $_.InstanceID }

# 依群組查詢
Get-NetFirewallRule -Group "File and Printer Sharing"
Get-NetFirewallRule -Group "Windows Remote Management"

# 查看規則的 Security 過濾器
Get-NetFirewallRule -DisplayName "SSH" | Get-NetFirewallSecurityFilter
```

## 4. 參數速查

| 參數 | 說明 | 常用值 |
| --- | --- | --- |
| `-DisplayName` | 規則顯示名稱（可重複） | 任意字串 |
| `-Direction` | 流量方向 | `Inbound` / `Outbound` |
| `-Action` | 動作 | `Allow` / `Block` |
| `-Enabled` | 啟用狀態 | `True` / `False` |
| `-Profile` | 設定檔 | `Domain` / `Private` / `Public` / `Any` |
| `-Protocol` | 通訊協定 | `TCP` / `UDP` / `ICMPv4` / `ICMPv6` / `Any` |
| `-LocalPort` | 本機埠號 | 單一埠號或陣列 `80,443` |
| `-RemotePort` | 遠端埠號 | 同上 |
| `-LocalAddress` | 本機 IP | `192.168.1.10`, `192.168.0.0/16` |
| `-RemoteAddress` | 遠端 IP | 同上，可用 `*` 表示任意 |
| `-Program` | 程式完整路徑 | `C:\Program Files\...` |
| `-Group` | 規則群組 | 如 `Windows 遠端管理` |
| `-IcmpType` | ICMP 類型 | `8` (Echo Request), `3` (Destination Unreachable) |

## 5. 場景示例

### 場景 A：開放 Web 服務（80/443）

```powershell
New-NetFirewallRule -DisplayName "Web HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "Web HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName "Web Outbound" -Direction Outbound -Protocol TCP -RemotePort 80,443 -Action Allow
```

### 場景 B：限制管理存取（僅允許特定 IP 的 RDP）

```powershell
# 先確認現有 RDP 規則
Get-NetFirewallRule -DisplayName "Remote Desktop*"

# 修改為僅允許特定網段
Set-NetFirewallRule -DisplayName "Remote Desktop (TCP-In)" -RemoteAddress 10.0.0.0/8

# 或新增一條更嚴格的規則（注意順序）
New-NetFirewallRule -DisplayName "RDP Restricted" -Direction Inbound -Protocol TCP -LocalPort 3389 -RemoteAddress 192.168.1.0/24 -Action Allow
```

### 場景 C：阻斷惡意程式出站

```powershell
# 假設已知惡意程式的完整路徑
New-NetFirewallRule -DisplayName "Block Malware" -Direction Outbound -Program "C:\Users\malware.exe" -Action Block

# 阻斷特定 IP 的雙向通訊
New-NetFirewallRule -DisplayName "Block C2 Server" -Direction Outbound -RemoteAddress 203.0.113.100 -Action Block
New-NetFirewallRule -DisplayName "Block C2 Server In" -Direction Inbound -RemoteAddress 203.0.113.100 -Action Block
```

### 場景 D：全部封鎖，僅開放特定埠（白名單模式）

```powershell
# 步驟 1：將出站預設改為阻斷（需注意，可能影響系統更新）
Set-NetFirewallRule -DisplayName "Outbound Default" -Action Block

# 步驟 2：逐一開放所需埠
New-NetFirewallRule -DisplayName "Allow DNS" -Direction Outbound -Protocol UDP -RemotePort 53 -Action Allow
New-NetFirewallRule -DisplayName "Allow Web" -Direction Outbound -Protocol TCP -RemotePort 80,443 -Action Allow
New-NetFirewallRule -DisplayName "Allow NTP" -Direction Outbound -Protocol UDP -RemotePort 123 -Action Allow
```

### 場景 E：查看防火牆日誌

```powershell
# 開啟防火牆記錄（需先設定記錄路徑）
netsh advfirewall set currentprofile logging filename "C:\Windows\System32\LogFiles\Firewall\pfirewall.log"
netsh advfirewall set currentprofile logging droppedconnections enable
netsh advfirewall set currentprofile logging allowedconnections enable

# 查看記錄
Get-Content "C:\Windows\System32\LogFiles\Firewall\pfirewall.log" -Tail 50
```

## 6. 故障排查建議

1. **執行權限**：所有 NetSecurity Cmdlet 需要「以系統管理員身分執行」PowerShell。
2. **規則衝突**：Windows 防火牆的規則是「允許優先」，Block 規則若被更前面的 Allow 規則覆蓋，需調整規則順序或停用 Allow 規則。
3. **名稱重複**：`DisplayName` 可以重複，但 `Name`（GUID）唯一；刪除時建議用 `-DisplayName` 並搭配 `-Confirm` 確認。
4. **虛擬網路卡**：Hyper-V / Docker / WSL 會建立虛擬網路卡，防火牆規則可能對其無效或需要額外設定。
5. **群組原則覆蓋**：若電腦加入 AD 網域，網域防火牆原則可能覆蓋本機規則，需在群組原則管理員中調整。
6. **遠端管理**：透過 WinRM 遠端執行防火牆命令需先確保 WinRM 防火牆例外已開放。
7. **回復出廠值**：`netsh advfirewall reset` 可將防火牆還原至安裝預設值。
8. **差異比對**：使用 `Compare-Object` 比對兩台機器的規則清單。

## 7. 進階閱讀

- `Get-Help about_NetSecurity`
- `Get-Command -Module NetSecurity`
- Microsoft Docs：Windows Firewall with Advanced Security
- 注意：Windows 防火牆在實際開發中應以 PowerShell 優先，netsh 命令已逐步淘汰。
