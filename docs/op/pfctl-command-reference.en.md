# pfctl Command Reference

This document provides a comprehensive reference for using `pfctl` (Packet Filter) on macOS, covering common commands, parameter descriptions, and typical use cases.

## 1. Basic Concepts

- **Anchor**: A logical grouping of pf rules, similar to iptables tables + chains.
- **Table**: An efficient address set in pf, commonly used for whitelist/blacklist management.
- **Rule**: Composed of matching conditions and an action, evaluated sequentially from `/etc/pf.conf`.
- **Action**: `pass` (allow), `block` (deny), `match`, `scrub`.
- **Direction**: `in` (inbound), `out` (outbound).

macOS pf does not support inserting or deleting rules by line number; you must edit the configuration file and reload.

## 2. Command Structure

```
pfctl [parameters] [options]
```

| Parameter | Description |
|-----------|-------------|
| `-s` | Show information, used with `rules`, `nat`, `all`, etc. |
| `-f` | Load the specified configuration file (overwrites all existing rules). |
| `-e` | Enable packet filtering. |
| `-d` | Disable packet filtering. |
| `-N` | Do not load NAT rules (used with `-f`). |
| `-a` | Specify an anchor. |
| `-t` | Manipulate tables, used with `-T` subcommand. |
| `-v` | Verbose output. |

## 3. Common Commands Quick Reference

### 3.1 View Status & Rules

```
pfctl -s rules -v
pfctl -s nat
pfctl -s all
pfctl -s rules -a myanchor
pfctl -s queue
```

### 3.2 Enable / Disable

```
sudo pfctl -e
sudo pfctl -d
sudo pfctl -f /etc/pf.conf
sudo pfctl -nf /etc/pf.conf
```

### 3.3 Manage Tables

```
pfctl -s tables
pfctl -t blacklist -T show
pfctl -t blacklist -T add 10.0.0.1
pfctl -t blacklist -T delete 10.0.0.1
pfctl -t whitelist -T load -f /etc/whitelist.txt
pfctl -t blacklist -T test 10.0.0.1
```

### 3.4 View Connection States

```
pfctl -s state
pfctl -s state -v
pfctl -s info
```

## 4. pf.conf Syntax Quick Reference

```
action [direction] [log] [quick] [on interface] [proto protocol] [from src] [to dst] [port ...]
```

### 4.1 Basic Allow & Block

```
pass in quick on lo0 all
block in quick from 10.0.0.0/8 to any
pass in proto tcp from 192.168.1.0/24 to any port 22
block in all
```

### 4.2 State Tracking

```
pass out proto tcp all keep state
pass in proto tcp all modulate state
pass in proto tcp to any port { 80, 443 } keep state
```

### 4.3 NAT / Port Forwarding

```
nat on en0 from 192.168.0.0/24 to any -> (en0)
rdr pass on en0 proto tcp to any port 2222 -> 10.0.0.10 port 22
rdr pass on lo0 proto tcp to any port 80 -> 127.0.0.1 port 8080
```

### 4.4 Table Integration

```
table <blacklist> persist
block drop in quick from <blacklist> to any
```

### 4.5 Logging

```
block in log all
pass in log proto tcp to any port 22
```

## 5. Scenario Examples

### Scenario A: Allow SSH Only from a Specific Subnet

```
# /etc/pf.conf
block in all
pass out all keep state
pass in quick on lo0 all
pass in proto tcp from 192.168.1.0/24 to any port 22 keep state
```

### Scenario B: macOS Internet Sharing (NAT)

```
# /etc/pf.conf
nat on en0 from 192.168.2.0/24 to any -> (en0)
pass in on en1 from 192.168.2.0/24 to any keep state
pass out on en0 from 192.168.2.0/24 to any keep state
```

## 6. Troubleshooting Tips

1. All pfctl operations require `sudo`; ensure the user has sudo privileges.
2. Use `pfctl -nf /etc/pf.conf` to validate syntax before loading.
3. Rules are matched sequentially; the `quick` keyword short-circuits further rule evaluation.
4. `/etc/pf.conf` may be overwritten after macOS updates; keep a backup.
5. Use `tcpdump -r /var/log/pflog` to inspect pf logs.

## 7. Further Reading

- `man pfctl` / `man pf.conf`
- macOS default `/etc/pf.conf`
