#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# compile-musl.sh — 以 musl 目標編譯 kyklos (靜態連結)
# ============================================================
# 用法:
#   chmod +x compile-musl.sh && ./compile-musl.sh
#
# 前置需求:
#   - Rust 工具鏈 (rustup)
#   - musl 目標: rustup target add x86_64-unknown-linux-musl
#   - musl-gcc (或 Docker 環境)
#
# 產出:
#   ./kyklos  (靜態連結的 musl 二進位檔)
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

echo "========================================"
echo " compile-musl.sh — 靜態編譯 kyklos"
echo "========================================"

# ── 1. 確保 musl target 已安裝 ──────────────────────────────
if ! rustup target list --installed 2>/dev/null | grep -q "x86_64-unknown-linux-musl"; then
    echo "[...] 安裝 musl target: x86_64-unknown-linux-musl ..."
    rustup target add x86_64-unknown-linux-musl
fi

# ── 2. 使用 musl target 進行 release 編譯 ──────────────────
echo "[...] 編譯中 (cargo build --release --target x86_64-unknown-linux-musl) ..."
cargo build --release --target x86_64-unknown-linux-musl

# ── 3. 複製執行檔到專案根目錄 ─────────────────────────────
echo "[...] 複製執行檔到 $SCRIPT_DIR/kyklos ..."
cp "target/x86_64-unknown-linux-musl/release/kyklos" "$SCRIPT_DIR/kyklos"

echo "[✓] 完成！"
echo ""
echo " 執行檔: $SCRIPT_DIR/kyklos"
file "$SCRIPT_DIR/kyklos"
echo ""
echo " 啟動方式:"
echo "   sudo ./kyklos"
