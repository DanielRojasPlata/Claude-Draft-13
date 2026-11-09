#!/usr/bin/env bash
# Smoke-tests the PACKAGED layout (resources/server, afterPack node_modules, portable data folder) using the Linux build.
# Usage: e2e/packaged-smoke.sh   (after: npx electron-builder --linux dir --x64)
set -u
BIN="$(cd "$(dirname "$0")/.." && pwd)/dist/linux-unpacked/guionista-desktop"
DIR="$(dirname "$BIN")"
rm -rf "$DIR/GuionistaData"
xvfb-run -a "$BIN" --no-sandbox --remote-debugging-port=9339 >/tmp/packaged.log 2>&1 &
sleep 14
J=$(curl -s localhost:9339/json 2>/dev/null)
echo "$J" | grep -o '"url": "[^"]*"' | head -3
echo "$J" | grep -q '/scripts' && echo "PASS window loaded /scripts" || echo "FAIL window did not load /scripts"
[ -d "$DIR/GuionistaData" ] && echo "PASS portable data folder created next to the app: $(ls "$DIR/GuionistaData" | head -1)" || echo "FAIL no GuionistaData folder"
ls "$DIR"/GuionistaData/*.json >/dev/null 2>&1 && echo "PASS seed script written" || echo "FAIL no seed script"
pkill -f "linux-unpacked/guionista-desktop" 2>/dev/null; sleep 1
ss -ltn 2>/dev/null | grep -c 127.0.0.1 | sed 's/^/listeners left on 127.0.0.1 after quit: /'
