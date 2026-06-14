#!/usr/bin/env bash
# ============================================================
# backend/build-musl.sh — 以 musl 靜態編譯 kyklos
# ============================================================
# 用法:
#   cd backend && chmod +x build-musl.sh && ./build-musl.sh
#   ./build-musl.sh x86_64-unknown-linux-musl        # 指定 target
#   ./build-musl.sh aarch64-unknown-linux-musl       # 跨編譯 ARM64
#
# 環境變數:
#   TARGET   musl target (預設: x86_64-unknown-linux-musl)
#   STRIP    是否去除符號表 (1=是, 0=否；預設 1)
#
# 前置需求:
#   - Rust 工具鏈 (rustup)
#   - musl 工具鏈 (Debian/Ubuntu: musl-tools;
#                 Alpine: 內建;
#                 跨編譯 aarch64: musl-tools + aarch64-linux-musl)
#
# 產出:
#   backend/target/<TARGET>/release/kyklos
#   backend/kyklos                                  (複製版)
# ============================================================

set -euo pipefail

# ── 切到 backend 目錄（以本腳本位置為基準）────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 參數與環境變數 ─────────────────────────────────────────
TARGET="${1:-${TARGET:-x86_64-unknown-linux-musl}}"
STRIP="${STRIP:-1}"

# 主機平台資訊
HOST_OS="$(uname -s)"
HOST_ARCH="$(uname -m)"

echo "========================================"
echo " build-musl.sh — 靜態編譯 kyklos"
echo " 主機平台:   ${HOST_OS}/${HOST_ARCH}"
echo " 編譯目標:   ${TARGET}"
echo " 精簡符號:   ${STRIP}"
echo " 工作目錄:   ${SCRIPT_DIR}"
echo "========================================"
echo ""

# ── 1. 確認 Rust 工具鏈 ────────────────────────────────────
if ! command -v cargo &>/dev/null; then
    echo "[✗] 找不到 cargo，請先安裝 Rust 工具鏈" >&2
    echo "    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y" >&2
    exit 1
fi
echo "[✓] Rust: $(rustc --version)"

# ── 2. 確保 musl target 已安裝 ──────────────────────────────
if ! rustup target list --installed 2>/dev/null | grep -q "^${TARGET}\$"; then
    echo "[...] 安裝 musl target: ${TARGET} ..."
    rustup target add "${TARGET}"
else
    echo "[✓] target 已安裝: ${TARGET}"
fi

# ── 3. 設定 C 編譯器為 musl-gcc ────────────────────────────
# Rust 的 musl target 需要對應的 musl-gcc 作為 C 編譯器，
# 才能編譯含有 C 程式碼的 crate（rusqlite / pcap / snmp2 / ssh2 等）。
TARGET_UNDERSCORE="${TARGET//-/_}"
TARGET_UNDERSCORE_UPPER="$(echo "${TARGET_UNDERSCORE}" | tr '[:lower:]' '[:upper:]')"

# 依 target 挑選對應的 musl-gcc
case "${TARGET}" in
    x86_64-unknown-linux-musl)
        MUSL_GCC="musl-gcc"
        ;;
    aarch64-unknown-linux-musl)
        MUSL_GCC="aarch64-linux-musl-gcc"
        ;;
    arm-unknown-linux-musleabihf|arm-unknown-linux-musleabi)
        MUSL_GCC="arm-linux-musleabihf-gcc"
        ;;
    *)
        MUSL_GCC="musl-gcc"
        ;;
esac

# 若系統是 Alpine（libc 已是 musl），直接使用系統 gcc
IS_ALPINE=0
if [ -f /etc/alpine-release ]; then
    IS_ALPINE=1
fi

if [ "${IS_ALPINE}" -eq 1 ]; then
    echo "[✓] 偵測到 Alpine Linux，使用系統 gcc"
elif command -v "${MUSL_GCC}" &>/dev/null; then
    echo "[...] 設定 C 編譯器為 ${MUSL_GCC}"
    export "CC_${TARGET_UNDERSCORE}=${MUSL_GCC}"
    export "CARGO_TARGET_${TARGET_UNDERSCORE_UPPER}_LINKER=${MUSL_GCC}"
else
    echo "[!] 找不到 ${MUSL_GCC}，嘗試繼續（若編譯失敗請安裝 musl-tools）"
    echo "    Debian/Ubuntu: sudo apt-get install musl-tools"
    echo "    Alpine:        apk add musl-dev"
fi

# ── 4. release 編譯 ────────────────────────────────────────
echo ""
echo "[...] 編譯中 (cargo build --release --target ${TARGET}) ..."
cargo build --release --target "${TARGET}"

# ── 5. 精簡符號表（可選）────────────────────────────────────
BIN_PATH="target/${TARGET}/release/kyklos"
if [ ! -f "${BIN_PATH}" ]; then
    echo "[✗] 找不到編譯產物: ${BIN_PATH}" >&2
    exit 1
fi

if [ "${STRIP}" = "1" ] && command -v strip &>/dev/null; then
    echo "[...] 精簡符號表 (strip) ..."
    strip "${BIN_PATH}" || echo "[!] strip 失敗，略過"
fi

# ── 6. 複製到 backend 根目錄 ────────────────────────────────
cp "${BIN_PATH}" "${SCRIPT_DIR}/kyklos"
chmod +x "${SCRIPT_DIR}/kyklos"

# ── 7. 顯示結果 ─────────────────────────────────────────────
BIN_SIZE="$(du -h "${SCRIPT_DIR}/kyklos" | cut -f1)"
echo ""
echo "========================================"
echo " [✓] 編譯完成"
echo "========================================"
echo " 產出位置: ${SCRIPT_DIR}/kyklos (${BIN_SIZE})"
echo ""
file "${SCRIPT_DIR}/kyklos" 2>/dev/null || true
echo ""
echo " 啟動方式:"
echo "   sudo ./kyklos"
echo ""
echo " 額外參數:"
echo "   ./kyklos -a :8080 -u admin -p mypass"
