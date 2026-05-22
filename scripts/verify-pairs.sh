#!/usr/bin/env bash
#
# verify-pairs.sh — fails fast if any .src/.cut pair has mismatched dimensions.
# Runs as a hard gate after build-assets.sh.
#
# Per-algo pairs: every <slug>.src.jpg may have up to three sibling cuts
# (<slug>.auto.cut.png, .person.cut.png, .saliency.cut.png). A missing cut
# is not a verify-time failure — it's a recorded honest miss in
# assets/pairs/manifest.json (e.g. --algo person on a horse). A *dimension
# mismatch* between src and any present cut IS a hard failure: the slider
# would render misaligned.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAIRS="$ROOT/assets/pairs"
ALGOS="$ROOT/assets/algos"

fail=0
check() {
  local src="$1" cut="$2"
  if [[ ! -f "$cut" ]]; then
    printf "skip %-60s no cut on disk (honest miss or no-cutout chapter)\n" "$(basename "$cut")"
    return
  fi
  local d_src d_cut
  d_src=$(magick identify -format "%wx%h" "$src" 2>/dev/null || echo "?")
  d_cut=$(magick identify -format "%wx%h" "$cut" 2>/dev/null || echo "?")
  if [[ "$d_src" != "$d_cut" ]] || [[ "$d_src" == "?" ]]; then
    printf "BAD  %s != %s  (%s vs %s)\n" "$(basename "$src")" "$(basename "$cut")" "$d_src" "$d_cut"
    fail=1
  else
    printf "ok   %-60s %s\n" "$(basename "$cut")" "$d_src"
  fi
}

# 1) timeline pairs — every (src, algo) attempted
for src in "$PAIRS"/*.src.jpg; do
  base="${src%.src.jpg}"
  for algo in auto person saliency; do
    check "$src" "$base.$algo.cut.png"
  done
done

# 2) algorithm-card demos — one cut per card (still single-cut by design)
for src in "$ALGOS"/*.src.png; do
  base="${src%.src.png}"
  check "$src" "$base.cut.png"
done

if (( fail )); then
  echo
  echo "FAIL: pair dimensions do not match — slider would render misaligned."
  exit 1
fi
echo
echo "all present pairs match dimensions"
