# pfctl コマンドリファレンス

このドキュメントでは、macOS における `pfctl`（Packet Filter）の一般的なコマンド、パラメータの説明、および代表的なユースケースを網羅的に解説します。

## 1. 基本概念

- **Anchor（アンカー）**：pf ルールを論理的にグループ化する仕組み。iptables のテーブル＋チェーンに相当します。
- **Table（テーブル）**：pf における効率的なアドレス集合で、ホワイトリスト／ブラックリスト管理に広く使われます。
- **Rule（ルール）**：マッチ条件とアクションから構成され、`/etc/pf.conf` の記述順に評価されます。
- **アクション**：`pass`（許可）、`block`（拒否）、`match`、`scrub`。
- **方向**：`in`（受信）、`out`（送信）。

macOS の pf は行番号によるルールの挿入・削除をサポートしていません。設定ファイルを編集してから再読み込みを行う必要があります。

## 2. コマンド構造

```
pfctl [パラメータ] [オプション]
```

| パラメータ | 説明 |
|-----------|------|
| `-s` | 情報を表示します。`rules`、`nat`、`all` などと組み合わせて使います。 |
| `-f` | 指定した設定ファイルを読み込みます（既存の全ルールを上書き）。 |
| `-e` | パケットフィルタリングを有効にします。 |
| `-d` | パケットフィルタリングを無効にします。 |
| `-N` | NAT ルールを読み込みません（`-f` と組み合わせて使用）。 |
| `-a` | アンカーを指定します。 |
| `-t` | テーブルを操作します。`-T` サブコマンドと組み合わせて使用。 |
| `-v` | 詳細な出力を行います。 |

## 3. よく使うコマンド一覧

### 3.1 状態とルールの確認

```
pfctl -s rules -v
pfctl -s nat
pfctl -s all
pfctl -s rules -a myanchor
pfctl -s queue
```

### 3.2 有効化 / 無効化

```
sudo pfctl -e
sudo pfctl -d
sudo pfctl -f /etc/pf.conf
sudo pfctl -nf /etc/pf.conf
```

### 3.3 テーブルの管理

```
pfctl -s tables
pfctl -t blacklist -T show
pfctl -t blacklist -T add 10.0.0.1
pfctl -t blacklist -T delete 10.0.0.1
pfctl -t whitelist -T load -f /etc/whitelist.txt
pfctl -t blacklist -T test 10.0.0.1
```

### 3.4 コネクション状態の確認

```
pfctl -s state
pfctl -s state -v
pfctl -s info
```

## 4. pf.conf 構文クイックリファレンス

```
action [direction] [log] [quick] [on interface] [proto protocol] [from src] [to dst] [port ...]
```

### 4.1 基本許可とブロック

```
pass in quick on lo0 all
block in quick from 10.0.0.0/8 to any
pass in proto tcp from 192.168.1.0/24 to any port 22
block in all
```

### 4.2 ステートトラッキング

```
pass out proto tcp all keep state
pass in proto tcp all modulate state
pass in proto tcp to any port { 80, 443 } keep state
```

### 4.3 NAT / ポートフォワーディング

```
nat on en0 from 192.168.0.0/24 to any -> (en0)
rdr pass on en0 proto tcp to any port 2222 -> 10.0.0.10 port 22
rdr pass on lo0 proto tcp to any port 80 -> 127.0.0.1 port 8080
```

### 4.4 テーブル連携

```
table <blacklist> persist
block drop in quick from <blacklist> to any
```

### 4.5 ログ記録

```
block in log all
pass in log proto tcp to any port 22
```

## 5. シナリオ例

### シナリオ A：特定サブネットからの SSH のみ許可

```
# /etc/pf.conf
block in all
pass out all keep state
pass in quick on lo0 all
pass in proto tcp from 192.168.1.0/24 to any port 22 keep state
```

### シナリオ B：macOS インターネット共有（NAT）

```
# /etc/pf.conf
nat on en0 from 192.168.2.0/24 to any -> (en0)
pass in on en1 from 192.168.2.0/24 to any keep state
pass out on en0 from 192.168.2.0/24 to any keep state
```

## 6. トラブルシューティングのヒント

1. すべての pfctl 操作には `sudo` が必要です。ユーザーが sudo 権限を持っていることを確認してください。
2. 設定を読み込む前に `pfctl -nf /etc/pf.conf` で構文チェックを行いましょう。
3. ルールは上から順にマッチします。`quick` キーワードを使うと、以降のルール評価をスキップできます。
4. macOS のアップデート後、`/etc/pf.conf` が上書きされる可能性があるので、必ずバックアップを取ってください。
5. `tcpdump -r /var/log/pflog` で pf のログを確認できます。

## 7. 参考情報

- `man pfctl` / `man pf.conf`
- macOS デフォルトの `/etc/pf.conf`
