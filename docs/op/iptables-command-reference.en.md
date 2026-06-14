# iptables Command Reference

This document covers common `iptables`/`ip6tables` commands, parameter
explanations, and typical usage scenarios on Linux, making it easy for
beginners to look up and practice.

## 1. Basic Concepts

- **Table**: Categorized by function. Common tables include `raw`
  (before connection tracking), `mangle` (packet modification), `nat`
  (address translation), and `filter` (packet filtering).
- **Chain**: The processing path for packets within each table, e.g.
  `INPUT`, `OUTPUT`, `FORWARD`, `PREROUTING`, `POSTROUTING`.
  User-defined chains can be created.
- **Rule**: Consists of matching conditions and a target action.
  Rules are evaluated top-down.
- **Target**: The action, e.g. `ACCEPT`, `DROP`, `REJECT`, `LOG`,
  `SNAT`, `DNAT`, etc.

IPv6 uses the `ip6tables` command; its syntax is nearly identical to
IPv4, with only differences in address/module support.

## 2. Command Structure

```
iptables [-t table] COMMAND [chain] [match-conditions] [-j target]
```

Common global options:

| Option | Description |
|--------|-------------|
| `-t` | Specify the table; defaults to `filter`. |
| `-L` | List chain rules. Use with `-n`, `-v`, `--line-numbers`. |
| `-A` / `-I` / `-D` / `-R` | Append, insert, delete, replace. |
| `-F` / `-Z` / `-X` | Flush rules, zero counters, delete user-defined chains. |
| `-P` | Set the default policy for a chain (built-in chains only). |
| `-j` | Specify the target action. |
| `-m` | Enable match modules, e.g. `state`/`conntrack`/`limit`. |

## 3. Common Commands Quick Reference

### 3.1 View Existing Rules

```bash
iptables -L -n -v --line-numbers
iptables -t nat -L -n -v
ip6tables -t filter -L INPUT -n
```

### 3.2 Set Default Policy

```bash
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT
```

### 3.3 Allow SSH / Web Ports

```bash
iptables -A INPUT -p tcp --dport 22 -s 10.0.0.0/24 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -m state --state NEW -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -m state --state NEW -j ACCEPT
```

### 3.4 Reject or Rate-Limit Traffic

```bash
iptables -A INPUT -p tcp --dport 25 -j REJECT --reject-with icmp-port-unreachable
iptables -A INPUT -p tcp --dport 22 -m state --state NEW -m recent --set --name SSH
iptables -A INPUT -p tcp --dport 22 -m state --state NEW -m recent --update --seconds 60 --hitcount 5 --name SSH -j DROP
```

### 3.5 NAT / Port Forwarding

```bash
# LAN access to Internet via SNAT
iptables -t nat -A POSTROUTING -s 192.168.0.0/24 -o eth0 -j SNAT --to-source 203.0.113.10
# Dynamic address (e.g. PPPoE) can use MASQUERADE
iptables -t nat -A POSTROUTING -s 10.10.0.0/16 -o ppp0 -j MASQUERADE

# DNAT: forward external traffic to an internal host
iptables -t nat -A PREROUTING -d 203.0.113.10/32 -p tcp --dport 2222 -j DNAT --to-destination 192.168.0.10:22
iptables -A FORWARD -p tcp -d 192.168.0.10 --dport 22 -m state --state NEW,ESTABLISHED,RELATED -j ACCEPT
iptables -A FORWARD -p tcp -s 192.168.0.10 --sport 22 -m state --state ESTABLISHED -j ACCEPT
```

### 3.6 Transparent Proxy / Port Redirection

```bash
# Redirect traffic on port 80 to local port 8080 (e.g. HTTP proxy)
iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j REDIRECT --to-ports 8080
```

### 3.7 Logging and Rate Limiting

```bash
iptables -A INPUT -p tcp --dport 22 -m limit --limit 3/min -j LOG --log-prefix "SSH attempt: "
iptables -A INPUT -p icmp -m limit --limit 1/s --limit-burst 5 -j ACCEPT
iptables -A INPUT -p icmp -j DROP
```

### 3.8 Save and Restore

```bash
iptables-save > /etc/iptables/rules.v4
ip6tables-save > /etc/iptables/rules.v6
iptables-restore < /etc/iptables/rules.v4
ip6tables-restore < /etc/iptables/rules.v6
```

## 4. Scenario Examples

### Scenario A: Allow SSH Only from a Specific Subnet

```bash
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -s 192.168.1.0/24 -m state --state NEW -j ACCEPT
iptables -A INPUT -j LOG --log-prefix "DROP INPUT: "
```

### Scenario B: Dual-NIC Gateway SNAT and Firewall

```bash
# Enable kernel IP forwarding
sysctl -w net.ipv4.ip_forward=1

# NAT on the public interface
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# Forward policy
iptables -A FORWARD -i eth1 -o eth0 -m state --state NEW,ESTABLISHED,RELATED -j ACCEPT
iptables -A FORWARD -i eth0 -o eth1 -m state --state ESTABLISHED,RELATED -j ACCEPT

# Block external-initiated access to internal network
iptables -A FORWARD -i eth0 -o eth1 -j DROP
```

### Scenario C: IPv6 Inbound Only Allow Ports 80/443

```bash
ip6tables -P INPUT DROP
ip6tables -P FORWARD DROP
ip6tables -P OUTPUT ACCEPT
ip6tables -A INPUT -i lo -j ACCEPT
ip6tables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
ip6tables -A INPUT -p tcp --dport 80 -j ACCEPT
ip6tables -A INPUT -p tcp --dport 443 -j ACCEPT
```

### Scenario D: Limit Concurrent Connections per IP

```bash
iptables -A INPUT -p tcp --syn --dport 80 -m connlimit --connlimit-above 50 --connlimit-mask 32 -j REJECT
```

## 5. Troubleshooting Tips

1. **Conflict with nftables**: Check whether `iptables-nft` is in use;
   install `iptables-legacy` if needed.
2. **Missing kernel modules**: For errors like `-m conntrack`, load the
   `nf_conntrack` module or install the corresponding package.
3. **Rule ordering**: Rules are matched top-down. Use `--line-numbers`
   to view ordering and adjust with `-I`/`-R`.
4. **Debugging**: Use the `LOG` target to output messages to
   `dmesg`/`/var/log/messages`.
5. **Persistence**: Use `iptables-save` together with
   `systemd`/`/etc/rc.local` or your distribution's tools.

## 6. Further Reading

- `man iptables` / `man ip6tables`
- `man iptables-extensions`
- Netfilter.org official documentation

Combined with iptables-web, you can execute the above commands in a
GUI, observe their effects, and quickly export/import rules, lowering
the learning curve.
