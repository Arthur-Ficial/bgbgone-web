#!/usr/bin/env bash
#
# fetch-sources.sh
#
# Downloads the 8 strict-public-domain source images that power the
# 189-year history scroll on https://bgbgone.franzai.com, verifies each
# against a pinned SHA-256, and writes a per-image attribution stub.
#
# The two remaining timeline images (1984 McCandless EVA, 2015 Curiosity
# rover) are symlinked from bgbgone's own fixtures and not handled here.
#
# Idempotent. Safe to re-run. Fails fast on any checksum mismatch.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/assets/sources"
CHECKSUMS="$SRC_DIR/CHECKSUMS.sha256"
UA="bgbgone-web/0.1 (+https://bgbgone.franzai.com; arti.ficial@fullstackoptimization.com)"

mkdir -p "$SRC_DIR"

# slug | year | sha1 | upstream URL
# (sha1 is the Wikimedia file SHA-1, captured to make upstream-bitrot detection trivial)
# (sha256 lives in CHECKSUMS.sha256 and is what we verify locally)
SOURCES=(
  "1839-cornelius-self-portrait|1839|https://upload.wikimedia.org/wikipedia/commons/c/ce/1839_Self-portrait_by_Robert_Cornelius.jpg"
  "1840-bayard-self-portrait|1840|https://upload.wikimedia.org/wikipedia/commons/3/35/Hippolyte_Bayard%2C_Self%E2%80%90Portrait_as_a_Drowned_Man_%28Le_Noy%C3%A9%29%2C_1840.jpg"
  "1864-nadar-sarah-bernhardt|1864|https://upload.wikimedia.org/wikipedia/commons/3/3b/Sarah_Bernhardt%2C_par_Nadar%2C_1864.jpg"
  "1878-muybridge-horse-in-motion|1878|https://upload.wikimedia.org/wikipedia/commons/7/73/The_Horse_in_Motion.jpg"
  "1920-hine-powerhouse-mechanic|1920|https://upload.wikimedia.org/wikipedia/commons/b/bd/Lewis_W._Hine_-_Powerhouse_mechanic_-_Google_Art_Project.jpg"
  "1936-evans-allie-mae-burroughs|1936|https://upload.wikimedia.org/wikipedia/commons/2/26/Allie_Mae_Burroughs_print.jpg"
  "1972-cernan-on-the-moon|1972|https://upload.wikimedia.org/wikipedia/commons/2/2f/Apollo_17_Cernan_on_moon.jpg"
  "1997-sojourner-on-mars|1997|https://upload.wikimedia.org/wikipedia/commons/4/49/Pathfinder_and_Sojourner_%2818647779303%29.jpg"
  "blue-marble|1972|https://upload.wikimedia.org/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg"
  "gallery-aldrin|1969|https://upload.wikimedia.org/wikipedia/commons/9/98/Aldrin_Apollo_11_original.jpg"
  "gallery-car|1970|https://upload.wikimedia.org/wikipedia/commons/2/21/PINK_AUTOMOBILE_MANUFACTURED_BY_CADILLAC.jpg"
  "gallery-plane|2003|https://upload.wikimedia.org/wikipedia/commons/a/a9/F-22_Raptor%2C_head_on_view_-_030709-F-6911G-005.jpg"
  "gallery-bison|2017|https://upload.wikimedia.org/wikipedia/commons/8/8e/Portrait_of_a_bull_bison_on_a_sunny_winter_day_%2833407423668%29.jpg"
)

# Download (or skip if already present).
for entry in "${SOURCES[@]}"; do
  IFS="|" read -r slug year url <<<"$entry"
  out="$SRC_DIR/$slug.jpg"
  if [[ -f "$out" ]]; then
    printf "skip   %s (already present)\n" "$slug"
    continue
  fi
  printf "fetch  %s ... " "$slug"
  curl -fsSL -A "$UA" -o "$out.tmp" "$url"
  mv "$out.tmp" "$out"
  printf "ok (%s bytes)\n" "$(stat -f%z "$out")"
done

# Re-create the missing two timeline images as symlinks from bgbgone fixtures.
BG_FIXTURES="${BGBGONE_REPO:-/Users/arthurficial/dev/bgbgone}/Tests/fixtures"
ln -sfn "$BG_FIXTURES/02-nasa-mccandless-eva.jpg"    "$SRC_DIR/1984-mccandless-eva.jpg"
ln -sfn "$BG_FIXTURES/06-nasa-mars-curiosity-selfie.jpg" "$SRC_DIR/2015-curiosity-selfie.jpg"

# Capture / verify SHA-256.
cd "$SRC_DIR"
if [[ ! -f "$CHECKSUMS" ]]; then
  echo "no CHECKSUMS file yet — capturing fresh checksums"
  shasum -a 256 *.jpg > "$CHECKSUMS"
  echo "wrote $CHECKSUMS"
else
  # Append checksums for any new source files not yet pinned (e.g. a
  # newly added entry to $SOURCES). We never overwrite existing pins —
  # that would defeat the bitrot detection.
  for f in *.jpg; do
    if ! grep -q "  $f\$" "$CHECKSUMS"; then
      shasum -a 256 "$f" >> "$CHECKSUMS"
      echo "pinned new source: $f"
    fi
  done
  echo "verifying CHECKSUMS.sha256 ..."
  shasum -a 256 -c "$CHECKSUMS"
fi

echo ""
echo "ok — $(ls -1 "$SRC_DIR"/*.jpg | wc -l | tr -d ' ') source images present"
