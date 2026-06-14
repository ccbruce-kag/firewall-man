# Windows Firewall Command Reference

This document covers common PowerShell NetSecurity module commands for managing Windows Firewall, including parameter descriptions and typical usage scenarios.

## 1. Basic Concepts

- **Rule**: A firewall rule comprises a name, direction, action, protocol, port number, IP address, and other properties.
- **Direction**: `Inbound` or `Outbound`.
- **Action**: `Allow` or `Block`.
- **Profile**: `Domain`, `Private`, `Public`.

Administration is performed using the PowerShell `NetSecurity` module, which provides cmdlets such as `Get-/New-/Remove-/Set-/Copy-NetFirewallRule`.

## 2. Command Syntax

```
Get-NetFirewallRule [[-Name] <string[]>] [-Direction] [-Action] [-Enabled] [-Profile]
New-NetFirewallRule -DisplayName <string> -Direction <Direction> -Action <Action> [-LocalPort <port>] [-Protocol <protocol>]
Remove-NetFirewallRule [-DisplayName <string>] [-Name <string>]
Set-NetFirewallRule [-DisplayName <string>] [-Action <Action>] [-LocalPort <port>]
```

## 3. Common Commands Quick Reference

### 3.1 Viewing Existing Rules

```powershell
Get-NetFirewallRule | Format-Table -AutoSize
Get-NetFirewallRule -Direction Inbound -Action Allow | Format-Table DisplayName,Direction,Action,Enabled
Get-NetFirewallRule -Action Block | Format-Table DisplayName,Direction,Enabled
Get-NetFirewallRule -DisplayName "SSH" | Get-NetFirewallPortFilter
Get-NetFirewallRule -Enabled True
```

### 3.2 Creating New Rules

```powershell
New-NetFirewallRule -DisplayName "SSH" -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow
New-NetFirewallRule -DisplayName "Web HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "RDP Restricted" -Direction Inbound -Protocol TCP -LocalPort 3389 -RemoteAddress 192.168.1.0/24 -Action Allow
New-NetFirewallRule -DisplayName "Block Malicious IP" -Direction Inbound -RemoteAddress 203.0.113.55 -Action Block
New-NetFirewallRule -DisplayName "ICMPv4 Allow" -Direction Inbound -Protocol ICMPv4 -IcmpType 8 -Action Allow
```

### 3.3 Removing and Modifying Rules

```powershell
Remove-NetFirewallRule -DisplayName "SSH"
Disable-NetFirewallRule -DisplayName "SSH"
Enable-NetFirewallRule -DisplayName "SSH"
Set-NetFirewallRule -DisplayName "Web HTTP" -LocalPort 8080
Set-NetFirewallRule -DisplayName "RDP Restricted" -RemoteAddress 10.0.0.0/8
```

### 3.4 Exporting and Importing

```powershell
Export-NetFirewallRule -PolicyFilePath "C:\fw-backup.wfw"
Import-NetFirewallRule -PolicyFilePath "C:\fw-backup.wfw"
Get-NetFirewallRule | Format-List > C:\fw-rules.txt
```

## 4. Parameter Reference

| Parameter | Description | Common Values |
|-----------|-------------|---------------|
| `-DisplayName` | Display name of the rule | Any string |
| `-Direction` | Traffic direction | `Inbound` / `Outbound` |
| `-Action` | Action to take | `Allow` / `Block` |
| `-Enabled` | Enabled state | `True` / `False` |
| `-Profile` | Network profile | `Domain` / `Private` / `Public` |
| `-Protocol` | Communication protocol | `TCP` / `UDP` / `ICMPv4` |
| `-LocalPort` | Local port number | Single port or array `80,443` |
| `-RemoteAddress` | Remote IP address | `192.168.0.0/16` |
| `-Program` | Full program path | `C:\Program Files\...` |

## 5. Scenario Examples

### Opening Web Services (80/443)

```powershell
New-NetFirewallRule -DisplayName "Web HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "Web HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

### Restricting Administrative Access

```powershell
Set-NetFirewallRule -DisplayName "Remote Desktop (TCP-In)" -RemoteAddress 10.0.0.0/8
```

### Block All Except Specific Ports (Whitelist)

```powershell
Set-NetFirewallRule -DisplayName "Outbound Default" -Action Block
New-NetFirewallRule -DisplayName "Allow DNS" -Direction Outbound -Protocol UDP -RemotePort 53 -Action Allow
New-NetFirewallRule -DisplayName "Allow Web" -Direction Outbound -Protocol TCP -RemotePort 80,443 -Action Allow
```

## 6. Troubleshooting Tips

1. Run PowerShell as Administrator.
2. Allow rules take precedence over Block rules; be aware of rule conflicts.
3. `DisplayName` can be duplicated but `Name` (GUID) is unique.
4. Hyper-V / Docker / WSL virtual adapters may require additional configuration.
5. In Active Directory environments, Group Policy may override local rules.
6. `netsh advfirewall reset` resets to installation defaults.

## 7. Further Reading

- `Get-Help about_NetSecurity`
- `Get-Command -Module NetSecurity`
- Microsoft Docs: Windows Firewall with Advanced Security
