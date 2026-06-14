# Windows ファイアウォール コマンドリファレンス

このドキュメントでは、PowerShell NetSecurity モジュールを使用した Windows ファイアウォール管理の一般的なコマンド、パラメーターの説明、および代表的な使用シナリオについて説明します。

## 1. 基本概念

- **ルール (Rule)**：名前、方向、アクション、プロトコル、ポート番号、IP アドレスなどで構成されます。
- **方向**：`Inbound`（受信）、`Outbound`（送信）。
- **アクション**：`Allow`（許可）、`Block`（ブロック）。
- **プロファイル**：`Domain`、`Private`、`Public`。

PowerShell の `NetSecurity` モジュールを使用して管理します。`Get-/New-/Remove-/Set-/Copy-NetFirewallRule` などのコマンドレットが含まれます。

## 2. コマンド構文

```
Get-NetFirewallRule [[-Name] <string[]>] [-Direction] [-Action] [-Enabled] [-Profile]
New-NetFirewallRule -DisplayName <string> -Direction <Direction> -Action <Action> [-LocalPort <port>] [-Protocol <protocol>]
Remove-NetFirewallRule [-DisplayName <string>] [-Name <string>]
Set-NetFirewallRule [-DisplayName <string>] [-Action <Action>] [-LocalPort <port>]
```

## 3. コマンド一覧

### 3.1 既存ルールの表示

```powershell
Get-NetFirewallRule | Format-Table -AutoSize
Get-NetFirewallRule -Direction Inbound -Action Allow | Format-Table DisplayName,Direction,Action,Enabled
Get-NetFirewallRule -Action Block | Format-Table DisplayName,Direction,Enabled
Get-NetFirewallRule -DisplayName "SSH" | Get-NetFirewallPortFilter
Get-NetFirewallRule -Enabled True
```

### 3.2 新規ルールの作成

```powershell
New-NetFirewallRule -DisplayName "SSH" -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow
New-NetFirewallRule -DisplayName "Web HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "RDP Restricted" -Direction Inbound -Protocol TCP -LocalPort 3389 -RemoteAddress 192.168.1.0/24 -Action Allow
New-NetFirewallRule -DisplayName "Block Malicious IP" -Direction Inbound -RemoteAddress 203.0.113.55 -Action Block
New-NetFirewallRule -DisplayName "ICMPv4 Allow" -Direction Inbound -Protocol ICMPv4 -IcmpType 8 -Action Allow
```

### 3.3 ルールの削除と変更

```powershell
Remove-NetFirewallRule -DisplayName "SSH"
Disable-NetFirewallRule -DisplayName "SSH"
Enable-NetFirewallRule -DisplayName "SSH"
Set-NetFirewallRule -DisplayName "Web HTTP" -LocalPort 8080
Set-NetFirewallRule -DisplayName "RDP Restricted" -RemoteAddress 10.0.0.0/8
```

### 3.4 エクスポートとインポート

```powershell
Export-NetFirewallRule -PolicyFilePath "C:\fw-backup.wfw"
Import-NetFirewallRule -PolicyFilePath "C:\fw-backup.wfw"
Get-NetFirewallRule | Format-List > C:\fw-rules.txt
```

## 4. パラメーターリファレンス

| パラメーター | 説明 | 主な値 |
|-------------|------|--------|
| `-DisplayName` | ルールの表示名 | 任意の文字列 |
| `-Direction` | トラフィックの方向 | `Inbound` / `Outbound` |
| `-Action` | アクション | `Allow` / `Block` |
| `-Enabled` | 有効状態 | `True` / `False` |
| `-Profile` | ネットワークプロファイル | `Domain` / `Private` / `Public` |
| `-Protocol` | 通信プロトコル | `TCP` / `UDP` / `ICMPv4` |
| `-LocalPort` | ローカルポート番号 | 単一ポートまたは配列 `80,443` |
| `-RemoteAddress` | リモート IP アドレス | `192.168.0.0/16` |
| `-Program` | プログラムの完全パス | `C:\Program Files\...` |

## 5. シナリオ例

### Web サービスの開放 (80/443)

```powershell
New-NetFirewallRule -DisplayName "Web HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "Web HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

### 管理アクセスの制限

```powershell
Set-NetFirewallRule -DisplayName "Remote Desktop (TCP-In)" -RemoteAddress 10.0.0.0/8
```

### すべてブロックし特定ポートのみ許可（ホワイトリスト）

```powershell
Set-NetFirewallRule -DisplayName "Outbound Default" -Action Block
New-NetFirewallRule -DisplayName "Allow DNS" -Direction Outbound -Protocol UDP -RemotePort 53 -Action Allow
New-NetFirewallRule -DisplayName "Allow Web" -Direction Outbound -Protocol TCP -RemotePort 80,443 -Action Allow
```

## 6. トラブルシューティング

1. PowerShell を「管理者として実行」する必要があります。
2. Allow ルールは Block ルールより優先されます。ルールの競合に注意してください。
3. `DisplayName` は重複可能ですが、`Name`（GUID）は一意です。
4. Hyper-V / Docker / WSL の仮想アダプターには追加設定が必要な場合があります。
5. AD ドメイン環境ではグループポリシーがローカルルールを上書きする可能性があります。
6. `netsh advfirewall reset` でインストール時の既定値にリセットできます。

## 7. 関連情報

- `Get-Help about_NetSecurity`
- `Get-Command -Module NetSecurity`
- Microsoft Docs: Windows Firewall with Advanced Security
