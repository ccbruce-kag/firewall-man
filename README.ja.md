# Kyklos 在網路伺服器中的日文應用說明
循環型ネットワークアーキテクチャ

Kyklos は「循環構造のネットワーク」を意味する概念として使えます。

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Rust ベースのクロスプラットフォームファイアウォール Web 管理ツール。**Linux (iptables)**、**macOS (pfctl)**、**Windows (PowerShell NetSecurity)** をサポートします。

<br/>
<p align="center"><img width="256" alt="rustoauth2" src="docs/logo.svg" /></p>
<br/>

## 機能

- **クロスプラットフォーム対応**: Linux は iptables/ip6tables、macOS は pfctl、Windows は PowerShell NetSecurity を自動検出
- **IPv4 / IPv6 デュアルスタック**: IPv4 と IPv6 両方のファイアウォールルールを管理（Linux のみ）
- **プラットフォーム認識 UI**: フロントエンドがプラットフォームを自動検出し、コマンド名や操作ヒントを動的に切り替え
- **Web GUI**: Sneat Bootstrap 5 レスポンシブインターフェース、直感的なテーブル形式のルール表示と操作
- **ルール管理**: ルールの表示、追加、挿入、削除、フラッシュ
- **カウンター管理**: ルールまたはテーブルの統計情報をゼロリセット（iptables のみ）
- **インポート / エクスポート**: ルールの一括インポート・エクスポート
- **カスタムコマンド**: 任意のファイアウォールコマンドを直接実行
- **セキュリティ**: HTTP Basic Auth、パラメータインジェクション対策フィルタリング
- **バイリンガル UI**: 繁体字中国語 / 英語の即時切り替え

## クイックスタート

### Linux / macOS

```bash
# ビルド
cd backend && cargo build --release

# 実行（root / sudo 権限が必要）
sudo ./kyklos

# カスタムアドレスと認証情報
./kyklos -a :8080 -u myuser -p mypass

# 環境変数を使用
export IPT_WEB_USERNAME=admin
export IPT_WEB_PASSWORD=secret
export IPT_WEB_ADDRESS=:10001
./kyklos
```

### Windows

```powershell
# ビルド
cd backend && cargo build --release

# 実行（管理者として実行）
.\kyklos.exe
```

起動後、ブラウザで `http://<ホストIP>:10001` にアクセスしてください。

## プラットフォームの違い

| 機能 | Linux (iptables) | macOS (pfctl) | Windows (PowerShell) |
|------|------------------|---------------|----------------------|
| ルール一覧 | 完全な Chain/Table 構造 | 簡略化された一覧表示 | 全ルール一覧 |
| ルール追加/挿入 | 対応 | 対応（exec 経由） | 対応（`New-NetFirewallRule` 経由） |
| ルール削除 (id 指定) | 対応 | 非対応 | 対応（`Remove-NetFirewallRule`） |
| ルールフラッシュ | 対応（table/chain 単位） | 単一フラッシュ非対応 | 一括フラッシュ非対応 |
| カウンターゼロリセット | 対応 | 非対応 | 非対応 |
| 空のカスタムチェーン削除 | 対応 | 非対応 | 非対応 |
| インポート/エクスポート | iptables-save 形式 | pfctl -s all 形式 | PowerShell スクリプト形式 |
| カスタムコマンド | iptables コマンド | pfctl コマンド | PowerShell コマンド |

## Docker

```bash
docker build -t Miitai/kyklos:0.1.0 .
docker run -d --network host --privileged Miitai/kyklos:0.1.0
```

> 注: `--privileged` または `CAP_NET_ADMIN` ケイパビリティが必要です。これらがないとファイアウォールコマンドが拒否されます。

## API エンドポイント

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/version` | ファイアウォールバージョンの取得 |
| POST | `/listRule` | ルール一覧（パラメータ: table, chain, protocol） |
| POST | `/listExec` | 生コマンド出力の表示（パラメータ: table, chain） |
| POST | `/flushRule` | ルールフラッシュ（パラメータ: table, chain; Linux 以外では非対応） |
| POST | `/deleteRule` | 特定ルールの削除（パラメータ: table, chain, id; macOS 非対応） |
| POST | `/flushMetrics` | カウンターゼロリセット（パラメータ: table, chain, id; Linux のみ） |
| POST | `/getRuleInfo` | 単一ルール情報の取得（パラメータ: table, chain, id） |
| POST | `/flushEmptyCustomChain` | 空のカスタムチェーンフラッシュ（Linux のみ） |
| POST | `/export` | ルールエクスポート |
| POST | `/import` | ルールインポート（パラメータ: rule） |
| POST | `/exec` | カスタムファイアウォールコマンドの実行（パラメータ: args） |
| GET | `/` | 管理インターフェーストップページ |
| GET | `/platform` | 現在のプラットフォームの取得（linux / macos / windows） |
| GET | `/web/*path` | 静的アセット（Sneat Bootstrap 5 CSS/JS/フォント） |
| GET | `/docs/iptables-command-reference` | iptables コマンドリファレンス |

## 環境変数

| 変数 | 説明 | デフォルト値 |
|------|------|------------|
| `IPT_WEB_USERNAME` | ログインユーザー名 | `admin` |
| `IPT_WEB_PASSWORD` | ログインパスワード | `admin` |
| `IPT_WEB_ADDRESS` | リッスンアドレス | `:10001` |

## CLI 引数

| 引数 | 説明 | デフォルト値 |
|------|------|------------|
| `-u` / `--username` | ログインユーザー名 | `admin` |
| `-p` / `--password` | ログインパスワード | `admin` |
| `-a` / `--address` | リッスンアドレス | `:10001` |

## ディレクトリ構成

```
89.Miitai-firewall-admin/
├── Cargo.toml            # Rust プロジェクト設定
├── build.rs              # ビルドスクリプト（バージョン情報）
├── src/
│   ├── main.rs           # エントリポイント：CLI 引数、環境変数、プラットフォーム検出、初期化
│   ├── server.rs         # HTTP ルーティング、ミドルウェア、リクエスト処理（汎用 FirewallCmd トレイト）
│   ├── system.rs         # システム情報収集（hostname, memory, disk, process）
│   ├── firewall/
│   │   └── mod.rs        # FirewallCmd トレイト定義
│   ├── iptables/
│   │   ├── mod.rs        # モジュールエクスポート + Linux 用 FirewallCmd 実装
│   │   ├── types.rs      # データ構造（SystemTitle, Column 等）
│   │   ├── table.rs      # iptables 出力解析（正規表現）
│   │   └── iptable.rs    # iptables コマンド実行 + FirewallCmd impl
│   ├── pfctl/
│   │   └── mod.rs        # pfctl コマンド実行 + FirewallCmd impl（macOS）
│   ├── windows/
│   │   └── mod.rs        # PowerShell NetSecurity コマンド実行 + FirewallCmd impl（Windows）
│   └── utils/
│       └── mod.rs        # ユーティリティ関数（JSON 出力、文字列処理）
├── web/                  # フロントエンド静的アセット（index.html + Sneat Bootstrap 5 UI）
├── docs/                 # ドキュメント（コマンドリファレンス HTML/MD）
├── AGENTS.md
├── README.md
├── Makefile
├── Dockerfile
└── .gitignore
```

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| 言語 | Rust 2021 edition |
| Web フレームワーク | Axum 0.7 |
| 非同期ランタイム | Tokio（full features） |
| シリアライゼーション | Serde + Serde JSON |
| 静的アセット | Rust Embed |
| 正規表現 | Regex |
| フロントエンド UI | Sneat Bootstrap 5（Free） |
| 認証 | Basic Auth（Base64） |
| 抽象化レイヤー | `async-trait`（FirewallCmd） |
| システム情報収集 | `tokio::process::Command` シェルコマンド |
| フロントエンド Logger | 内蔵 JavaScript ロガーパネル（debug/info/warn/error） |

## アーキテクチャ

```
                    ┌──────────────┐
                    │  server.rs   │
                    │  (Arc<dyn    │
                    │   FirewallCmd)│
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼──────┐ ┌──▼────────┐ ┌─▼───────────┐
     │  IptablesCmd  │ │ PfctlCmd  │ │ WindowsCmd  │
     │  (Linux)      │ │ (macOS)   │ │ (Windows)   │
     │  iptables /   │ │ pfctl     │ │ powershell  │
     │  ip6tables    │ │           │ │ NetSecurity │
     └───────────────┘ └───────────┘ └─────────────┘
              │              │              │
     ┌────────▼──────┐ ┌────▼────┐ ┌──────▼──────┐
     │  table.rs     │ │ 内蔵     │ │ パイプライン │
     │  正規表現解析  │ │ 文字列   │ │ 出力解析     │
     │               │ │ 処理     │ │ デリミタ解析 │
     └───────────────┘ └─────────┘ └─────────────┘
```

- `FirewallCmd` トレイトは 11 の汎用ファイアウォール操作を定義し、3 つのバックエンドがそれぞれ実装します。
- `server.rs` は `Arc<dyn FirewallCmd>` を通じてディスパッチし、実装の詳細に依存しません。
- `main.rs` は起動時に OS（`linux` / `macos` / `windows`）を自動検出し、対応するバックエンドを選択します。
- フロントエンドは `GET /platform` API を呼び出してプラットフォームを取得し、コマンド名や UI のヒントを動的に調整します。

## 開発

```bash
# コンパイル
make release

# 実行（Linux / macOS は root / sudo が必要）
sudo ./kyklos

# Windows は管理者として実行
.\kyklos.exe

# カスタムアドレスと認証情報
./kyklos -a :8080 -u myuser -p mypass

# テスト
make test

# リンター
make check

# Docker イメージ（Linux のみ）
docker build -t Miitai/kyklos:0.1.0 .
```

> **注**: macOS では pfctl 操作に `sudo` 権限が必要です。Windows では PowerShell NetSecurity コマンドレットに管理者権限が必要です。

## Go 版からの移行

このプロジェクトは [iptables-web](https://github.com/pretty66/iptables-web) の Rust 移植版です。詳細は `AGENTS.md` を参照してください。

## UI リファレンス

UI デザインは [Sneat Bootstrap HTML Admin Template Free](https://github.com/themeselection/sneat-bootstrap-html-admin-template-free) を基にしています。

## ライセンス

Apache License 2.0
