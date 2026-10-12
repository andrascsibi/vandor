#!/usr/bin/env bash
# Headless screenshot of a URL — no project deps added. Reuses the Chromium that
# Playwright caches under ~/Library/Caches/ms-playwright (install once with
# `npx playwright install chromium`). The map fetches tiles + the 1.5 MB
# segments.json and auto-rolls a segment, so we give Chromium a virtual-time
# budget to let all that settle before the shot.
#
#   npm run dev            # in another terminal (serves http://localhost:5173/)
#   scripts/shot.sh                               # → shot.png of the running app
#   scripts/shot.sh http://localhost:5173/ out.png 8000
#
set -euo pipefail

URL="${1:-http://localhost:5173/}"
OUT="${2:-shot.png}"
WAIT_MS="${3:-8000}"            # virtual-time budget: wait for tiles/JSON/roll
WIDTH="${WIDTH:-1280}"
HEIGHT="${HEIGHT:-900}"
SCALE="${SCALE:-2}"            # device scale factor (2 = retina-sharp)

CHROME="$(find "$HOME/Library/Caches/ms-playwright" \
  -name 'Google Chrome for Testing' -type f 2>/dev/null | sort | tail -1)"
if [ -z "$CHROME" ]; then
  echo "No Playwright Chromium found. Run: npx playwright install chromium" >&2
  exit 1
fi

"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor="$SCALE" --window-size="${WIDTH},${HEIGHT}" \
  --virtual-time-budget="$WAIT_MS" --screenshot="$OUT" "$URL" 2>/dev/null

echo "wrote $OUT (${WIDTH}x${HEIGHT} @${SCALE}x, waited ${WAIT_MS}ms)"
