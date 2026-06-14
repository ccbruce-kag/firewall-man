# iptables コマンドリファレンス

Linux 環境における `iptables`/`ip6tables` の一般的なコマンド、
パラメーターの説明、および典型的な使用シナリオをまとめました。
初心者でもすぐに調べて実践できることを目的としています。

## 1. 基本概念

- **テーブル（Table）**：機能ごとに分類されます。代表的なテーブルとして
  `raw`（コネクショントラッキング前）、`mangle`（パケット変更）、
  `nat`（アドレス変換）、`filter`（パケットフィルタリング）があります。
- **チェイン（Chain）**：各テーブル内でのパケット処理経路です。
  `INPUT`、`OUTPUT`、`FORWARD`、`PREROUTING`、`POSTROUTING` などがあります。
  ユーザー定義チェインを作成することも可能です。
- **ルール（Rule）**：マッチ条件とターゲットアクションから構成され、
  上から順に評価されます。
- **ターゲット（Target）**：アクションのことです。
  `ACCEPT`、`DROP`、`REJECT`、`LOG`、`SNAT`、`DNAT` などがあります。

IPv6 では `ip6tables` コマンドを使用します。構文は IPv4 とほぼ同じですが、
アドレスやモジュールのサポートに一部差異があります。

## 2. コマンド構造

```
iptables [-t テーブル] COMMAND [チェイン] [マッチ条件] [-j ターゲット]
```

主なグローバルオプション：

| オプション | 説明 |
|-----------|------|
| `-t` | テーブルを指定します。デフォルトは `filter`。 |
| `-L` | チェインのルール一覧を表示。`-n`、`-v`、`--line-numbers` と併用。 |
| `-A` / `-I` / `-D` / `-R` | 追加、挿入、削除、置換。 |
| `-F` / `-Z` / `-X` | ルールのフラッシュ、カウンターのゼロクリア、ユーザー定義チェインの削除。 |
| `-P` | チェインのデフォルトポリシーを設定（ビルトインチェインのみ）。 |
| `-j` | ターゲットアクションを指定。 |
| `-m` | マッチモジュールを有効化。例：`state`/`conntrack`/`limit`。 |

## 3. コマンド早見表

### 3.1 既存ルールの確認

```bash
iptables -L -n -v --line-numbers
iptables -t nat -L -n -v
ip6tables -t filter -L INPUT -n
```

### 3.2 デフォルトポリシーの設定

```bash
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT
```

### 3.3 SSH / Web ポートの許可

```bash
iptables -A INPUT -p tcp --dport 22 -s 10.0.0.0/24 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -m state --state NEW -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -m state --state NEW -j ACCEPT
```

### 3.4 トラフィックの拒否／レート制限

```bash
iptables -A INPUT -p tcp --dport 25 -j REJECT --reject-with icmp-port-unreachable
iptables -A INPUT -p tcp --dport 22 -m state --state NEW -m recent --set --name SSH
iptables -A INPUT -p tcp --dport 22 -m state --state NEW -m recent --update --seconds 60 --hitcount 5 --name SSH -j DROP
```

### 3.5 NAT / ポートフォワーディング

```bash
# 内部ネットワークからインターネットアクセス（SNAT）
iptables -t nat -A POSTROUTING -s 192.168.0.0/24 -o eth0 -j SNAT --to-source 203.0.113.10
# 動的アドレス環境（PPPoE 等）では MASQUERADE を使用
iptables -t nat -A POSTROUTING -s 10.10.0.0/16 -o ppp0 -j MASQUERADE

# DNAT：外部トラフィックを内部ホストに転送
iptables -t nat -A PREROUTING -d 203.0.113.10/32 -p tcp --dport 2222 -j DNAT --to-destination 192.168.0.10:22
iptables -A FORWARD -p tcp -d 192.168.0.10 --dport 22 -m state --state NEW,ESTABLISHED,RELATED -j ACCEPT
iptables -A FORWARD -p tcp -s 192.168.0.10 --sport 22 -m state --state ESTABLISHED -j ACCEPT
```

### 3.6 透過プロキシ／ポートリダイレクト

```bash
# ポート 80 へのトラフィックをローカルのポート 8080 にリダイレクト（HTTP プロキシ等）
iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j REDIRECT --to-ports 8080
```

### 3.7 ログ記録とレート制限

```bash
iptables -A INPUT -p tcp --dport 22 -m limit --limit 3/min -j LOG --log-prefix "SSH attempt: "
iptables -A INPUT -p icmp -m limit --limit 1/s --limit-burst 5 -j ACCEPT
iptables -A INPUT -p icmp -j DROP
```

### 3.8 保存と復元

```bash
iptables-save > /etc/iptables/rules.v4
ip6tables-save > /etc/iptables/rules.v6
iptables-restore < /etc/iptables/rules.v4
ip6tables-restore < /etc/iptables/rules.v6
```

## 4. シナリオ例

### シナリオ A：特定サブネットのみ SSH を許可

```bash
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -s 192.168.1.0/24 -m state --state NEW -j ACCEPT
iptables -A INPUT -j LOG --log-prefix "DROP INPUT: "
```

### シナリオ B：デュアル NIC ゲートウェイの SNAT とファイアウォール

```bash
# カーネル IP フォワーディングを有効化
sysctl -w net.ipv4.ip_forward=1

# 外部インターフェースで NAT
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# フォワードポリシー
iptables -A FORWARD -i eth1 -o eth0 -m state --state NEW,ESTABLISHED,RELATED -j ACCEPT
iptables -A FORWARD -i eth0 -o eth1 -m state --state ESTABLISHED,RELATED -j ACCEPT

# 外部からの内部ネットワークへのアクセスをブロック
iptables -A FORWARD -i eth0 -o eth1 -j DROP
```

### シナリオ C：IPv6 で 80/443 のみ許可

```bash
ip6tables -P INPUT DROP
ip6tables -P FORWARD DROP
ip6tables -P OUTPUT ACCEPT
ip6tables -A INPUT -i lo -j ACCEPT
ip6tables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
ip6tables -A INPUT -p tcp --dport 80 -j ACCEPT
ip6tables -A INPUT -p tcp --dport 443 -j ACCEPT
```

### シナリオ D：IP 単位の同時接続数制限

```bash
iptables -A INPUT -p tcp --syn --dport 80 -m connlimit --connlimit-above 50 --connlimit-mask 32 -j REJECT
```

## 5. トラブルシューティング

1. **nftables との競合**：`iptables-nft` が使用されているか確認し、
   必要に応じて `iptables-legacy` をインストールしてください。
2. **カーネルモジュールの欠落**：`-m conntrack` 等のエラーが出る場合、
   `nf_conntrack` モジュールをロードするか、対応するパッケージをインストールしてください。
3. **ルールの順序**：ルールは上から順にマッチします。
   `--line-numbers` で順序を確認し、`-I`/`-R` で調整してください。
4. **デバッグ**：`LOG` ターゲットを使用して `dmesg`/`/var/log/messages` に出力します。
5. **永続化**：`iptables-save` と `systemd`/`/etc/rc.local` または
   ディストリビューションのツールを組み合わせて保存します。

## 6. 参考資料

- `man iptables` / `man ip6tables`
- `man iptables-extensions`
- Netfilter.org 公式ドキュメント

iptables-web と組み合わせることで、上記のコマンドを GUI 上で実行し、
効果を確認しながらルールのエクスポート／インポートを素早く行え、
学習コストを下げることができます。
