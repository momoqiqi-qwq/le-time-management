#!/usr/bin/env bash
# 注入 MSVC 环境，避免 Git Bash 的 /usr/bin/link 遮蔽 MSVC link.exe。
# 用法：bash build-windows.sh [tauri build 参数...]
set -e

MSVC=$(ls -d "/c/Program Files/Microsoft Visual Studio/"*/Community/VC/Tools/MSVC/*/ 2>/dev/null | sort -V | tail -1)
MSVC="${MSVC%/}"
if [ ! -d "$MSVC/bin/Hostx64/x64" ]; then
  echo "未找到 MSVC 工具链" >&2
  exit 1
fi

SDK="/c/Program Files (x86)/Windows Kits/10"
SDK_VER=$(ls "$SDK/Include" 2>/dev/null | sort -V | tail -1)
win() { printf '%s' "$1" | sed -e 's|^/\([a-z]\)/|\1:\\|' -e 's|/|\\|g'; }

export PATH="$MSVC/bin/Hostx64/x64:$HOME/.cargo/bin:$PATH"
export INCLUDE="$(win "$MSVC")\\include;$(win "$SDK")\\Include\\$SDK_VER\\ucrt;$(win "$SDK")\\Include\\$SDK_VER\\shared;$(win "$SDK")\\Include\\$SDK_VER\\um;$(win "$SDK")\\Include\\$SDK_VER\\winrt;$(win "$SDK")\\Include\\$SDK_VER\\cppwinrt"
export LIB="$(win "$MSVC")\\lib\\x64;$(win "$SDK")\\Lib\\$SDK_VER\\ucrt\\x64;$(win "$SDK")\\Lib\\$SDK_VER\\um\\x64"

echo "MSVC: $MSVC"
echo "SDK : $SDK_VER"
which link.exe

# 注意：npm 会把 --bundles 之类的选项当成自己的参数吞掉，
# 必须用 `npm run tauri -- build ...` 才能把参数透传给 tauri CLI。
npm run tauri -- build "$@"
