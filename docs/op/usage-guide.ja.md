# Miitai ファイアウォール管理プラットフォーム ユーザーガイド

本ガイドは、ファイアウォール管理プラットフォームを日常的に運用・管理する管理者向けのドキュメントです。システム機能、インストール方法、設定方法、Web UI と REST API の基本的な操作手順を説明します。

## 1. 機能概要

- **クロスプラットフォーム対応**: Linux（iptables/ip6tables）、macOS（pfctl）、Windows（PowerShell NetSecurity）– 起動時に自動検出。
- **デュアルスタックルール管理**（Linux）: `iptables` と `ip6tables` の両方をサポートし、Web ページ上で IPv4/IPv6 を切り替え可能。
- **組み込み Web UI**: 単一バイナリに内蔵された静的インターフェースで、ルールの表示、挿入/追加/削除、カウンターのリフレッシュ、インポート/エクスポートなどが可能。
- **REST API**: すべてのページ操作は HTTP エンドポイントで駆動され、スクリプトによる自動化が可能。
- **コマンド実行ヘルパー**: 基盤となるファイアウォールコマンドをラップし、一括操作や生コマンド出力の表示をサポート。
- **ダッシュボード**: リアルタイムのトラフィックトレンドチャート、プロトコル分布、Top IP/Port ランキング – すべてクライアント側で計算。
- **システム状態**: ホスト情報、メモリ/Swap 使用率、ディスク使用量、プロセス一覧。

## 2. 前提条件

| 条件 | 説明 |
|------|------|
| オペレーティングシステム | Linux / macOS / Windows |
| 実行権限 | Linux/macOS: root または `sudo`; Windows: 管理者 |
| 必要なコマンド（Linux） | `iptables`、`iptables-save`、`iptables-restore`（ip6tables も同様） |
| 必要なコマンド（macOS） | `pfctl`（内蔵） |
| 必要なコマンド（Windows） | PowerShell NetSecurity モジュール（内蔵） |
| Rust 環境（ビルド時） | Rust 2021 edition（`Cargo.toml` 参照） |

## 3. デプロイ方法

### 3.1 Docker（推奨）

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

- `--privileged --net=host` は、コンテナがホストのファイアウォールを操作できるようにします。
- `IPT_WEB_ADDRESS` のデフォルトは `:10001`（全インターフェース）です。`127.0.0.1:10001` を指定するとローカルのみアクセス可能になります。
- イメージタグはリリースバージョンに合わせて変更してください。

### 3.2 バイナリデプロイ

```bash
git clone <repository-url>
cd 89.Miitai-firewall-admin
cd backend && cargo build --release   # backend/target/release/kyklos を生成
sudo ./kyklos -a :10001 -u admin -p admin
```

バックグラウンド実行には `nohup`/`systemd`/`supervisor` などを使用してください。

## 4. 設定

| パラメータ | CLI フラグ | 環境変数 | デフォルト値 | 説明 |
|-----------|-----------|---------|------------|------|
| リッスンアドレス | `-a` | `IPT_WEB_ADDRESS` | `:10001` | HTTP サービスのバインドアドレス |
| ログインユーザー名 | `-u` | `IPT_WEB_USERNAME` | `admin` | Basic Auth ユーザー名 |
| ログインパスワード | `-p` | `IPT_WEB_PASSWORD` | `admin` | Basic Auth パスワード |

優先順位: コマンドライン引数 > 環境変数 > デフォルト値。すべての API エンドポイントは Basic Auth を使用します。本番環境では必ずデフォルト認証情報を変更し、HTTPS/リバースプロキシでトラフィックを保護してください。

## 5. 実行とモニタリング

`http://<ホスト>:10001` にアクセスします。ブラウザに Basic Auth のダイアログが表示されるので、デフォルトの `admin`/`admin` でログインします。

- Linux で iptables/ip6tables がない場合、ログに `exec [...] err` が出力されます。該当パッケージをインストールしてください。
- macOS では、すべての pfctl 操作に `sudo` が必要です。
- Windows では管理者として実行してください。

## 6. Web UI 操作ガイド

1. **プロトコル切り替え**（Linux のみ）: ページ上部の IPv4/IPv6 ラジオボタンで、すべてのリクエストで使用するプロトコルを決定します。
2. **テーブル/チェーンブラウジング**（Linux のみ）: `raw/mangle/nat/filter` のタブで切り替え。
3. **チェーン操作ボタン**（プラットフォームにより異なる）:
   - `挿入`: Linux は `iptables -I` を呼び出します。macOS/Windows は行番号挿入をサポートしません。
   - `追加`: Linux は `-A`、macOS は `pfctl -f`、Windows は `New-NetFirewallRule` を使用。
   - `カウンターゼロリセット`: Linux は `-Z` を実行。macOS/Windows は非対応。
   - `フラッシュ`: Linux は `-F` を実行。macOS はチェーンレベルのフラッシュをサポートしません。
   - `リフレッシュ`: 現在のチェーンのルールを再取得。
   - `コマンド表示`: 対応するファイアウォールコマンド出力を表示。
4. **グローバル操作**（右側のフローティングボタン、Linux でのみ完全対応）:
   - 全ルール / 現在のテーブルのルールをフラッシュ。
   - 空のカスタムチェーンをフラッシュ。
   - カウンターゼロリセット（すべて / 現在のテーブル）。
   - 現在のテーブルコマンドを表示。
   - 任意のコマンドを実行。
   - ルールのインポート / エクスポート。
5. **ダッシュボード**: ダッシュボードに切り替えると、リアルタイムのトラフィックトレンド、プロトコル分布、Top IP/Port を表示。
6. **システム状態**: システム状態ビューに切り替えると、ホスト情報、メモリ/Swap 使用率、ディスク使用量、プロセス一覧を表示。

## 7. REST API リファレンス

すべてのエンドポイントは Basic Auth が必要で、オプションの `protocol` パラメータ（`ipv4`/`ipv6`、デフォルト `ipv4`、Linux のみ有効）を受け付けます。

| パス | メソッド | パラメータ | 説明 |
|------|--------|-----------|------|
| `/version` | GET | - | 現在のコマンドバージョン文字列を返す |
| `/platform` | GET | - | プラットフォームタイプを返す（`linux` / `macos` / `windows`） |
| `/listRule` | POST | `table`, `chain` | チェーン一覧または単一チェーンのルールを取得 |
| `/listExec` | POST | `table`, `chain` | ファイアウォールコマンド出力を返す（iptables-save / pfctl / PowerShell） |
| `/flushRule` | POST | `table`, `chain` | 指定したテーブル/チェーンをフラッシュ。Linux は完全対応、macOS/Windows は限定対応 |
| `/flushMetrics` | POST | `table`, `chain`, `id` | カウンターをゼロリセット（Linux のみ） |
| `/deleteRule` | POST | `table`, `chain`, `id` | シーケンス番号でルールを削除（Linux のみ、macOS 非対応） |
| `/getRuleInfo` | POST | `table`, `chain`, `id` | ルールの内容を返す |
| `/flushEmptyCustomChain` | POST | - | 空のカスタムチェーンを削除（Linux のみ） |
| `/export` | POST | `table`, `chain` | ルールをテキストとしてエクスポート |
| `/import` | POST | `rule` | テキストからルールをインポート |
| `/exec` | POST | `args` | ファイアウォールサブコマンドを直接実行 |
| `/system/info` | GET | - | システム情報（hostname, IP, memory, disk, uptime, OS） |
| `/system/processes` | GET | - | プロセス一覧（PID, name, CPU%, MEM%, RSS, state, path） |

## 8. よくある質問

1. **Linux で "ipv6 iptables not available" と表示される**: ホストに `ip6tables` がインストールされていません。無視するか、ip6tables をインストールしてください。
2. **macOS でルール変更が反映されない**: `sudo pfctl -f` で再読み込みしていることを確認してください。pf は単一ルールの追加/削除をサポートしていません。
3. **Windows のコマンドが失敗する**: PowerShell を管理者として実行していることを確認してください。
4. **ダッシュボードにデータが表示されない**: ダッシュボードは、ファイアウォールルールにパケットカウンターデータがある場合にのみチャートを表示します。
5. **システム情報 API が空を返す**: `free`、`df`、`ps` などの標準ツールがホストにインストールされていることを確認してください（macOS は標準でインストール済み）。

## 9. 関連ドキュメント

- `docs/iptables-command-reference.md` – Linux iptables コマンドリファレンス。
- `docs/pfctl-command-reference.md` – macOS pfctl コマンドリファレンス。
- `docs/windows-firewall-command-reference.md` – Windows PowerShell NetSecurity コマンドリファレンス。
- `Makefile` – ビルドパラメーターとターゲット。
