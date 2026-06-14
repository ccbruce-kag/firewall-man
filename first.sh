#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# first.sh — Miitai kyklos 一次性安裝編譯腳本 (Ubuntu)
# ============================================================
# 用法:
#   chmod +x first.sh && sudo ./first.sh
#
# 說明:
#   1. 安裝 Rust 工具鏈（若尚未安裝）
#   2. 安裝系統相依套件（build-essential, iptables 等）
#   3. 執行 make release（即 cargo build --release）
#   4. 提示如何啟動服務
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo " Miitai kyklos 安裝腳本"
echo " 目標目錄: $SCRIPT_DIR"
echo "========================================"
echo ""

# ── 1. 安裝 Rust ──────────────────────────────────────────────
if command -v rustc &>/dev/null; then
    echo "[✓] Rust 已安裝: $(rustc --version)"
else
    echo "[...] 安裝 Rust ..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    # 將 Rust 加入當前環境
    source "$HOME/.cargo/env"
    echo "[✓] Rust 安裝完成: $(rustc --version)"
fi

# ── 2. 安裝系統相依套件 ─────────────────────────────────────
echo "[...] 更新套件列表並安裝相依套件 ..."
apt-get update -y
apt-get install -y \
    build-essential \
    pkg-config \
    curl \
    iptables \
    ip6tables \
    ca-certificates

echo "[✓] 系統套件安裝完成"

# ── 3. 編譯 ─────────────────────────────────────────────────
echo "[...] 執行 make release (cargo build --release) ..."
make release

echo "[✓] 編譯成功！"
echo ""
echo "========================================"
echo " 編譯產物: $SCRIPT_DIR/kyklos"
echo ""
echo " 啟動方式（root 權限）："
echo ""
echo "   # 直接執行"
echo "   sudo ./kyklos"
echo ""
echo "   # 或使用 cargo run"
echo "   cd backend && sudo cargo run"
echo ""
echo "   # 指定自訂位址與帳密"
echo "   sudo ./kyklos -a :8080 -u admin -p mypass"
echo ""
echo "   環境變數方式："
echo "   export IPT_WEB_USERNAME=admin"
echo "   export IPT_WEB_PASSWORD=secret"
echo "   export IPT_WEB_ADDRESS=:10001"
echo "   sudo -E ./kyklos"
echo ""
echo " 開啟瀏覽器訪問: http://<主機IP>:10001"
echo "========================================"
