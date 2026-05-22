#!/usr/bin/env bash
#
# build-assets.sh
#
# Single source of truth for every image rendered on bgbgone.franzai.com.
# Pins to the installed bgbgone binary (default /opt/homebrew/bin/bgbgone,
# overridable via $BGBGONE) and produces:
#
#   assets/pairs/<slug>.src.jpg               — 11 resampled sources
#                                                (10 timeline + Blue Marble)
#   assets/pairs/<slug>.<algo>.cut.png        — bgbgone cutout, one per algo
#                                                (auto, person, saliency).
#                                                Missing files are honest "no
#                                                cut produced for this combo"
#                                                signals — see manifest.json.
#   assets/pairs/manifest.json                — {ok:[…], failed:[…]} per combo
#   assets/algos/{vn-mask,person,saliency}.{src,cut}.png
#                                              — one demo per algorithm card
#   assets/multi/source.jpg + horse-NN.png    — Muybridge multi-instance
#   assets/bgmodes/blue-marble-transparent.png — Blue Marble cutout
#   assets/bgmodes/blue-marble-yellow.png     — Blue Marble on safelight amber
#   assets/bgmodes/blue-marble-muybridge.png  — Blue Marble onto Muybridge
#   assets/og.png                             — 1200x630 OG card
#   assets/help.txt                           — `bgbgone --help` snapshot
#
# Per-image algorithm choices below are deliberate, not fallbacks.
# Idempotent. Re-runs cleanly. Fails on any dimension mismatch.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/assets/sources"
PAIRS="$ROOT/assets/pairs"
ALGOS="$ROOT/assets/algos"
MULTI="$ROOT/assets/multi"
BGMODES="$ROOT/assets/bgmodes"
BGBGONE="${BGBGONE:-/opt/homebrew/bin/bgbgone}"
MAX=1200   # longest-side cap in px

mkdir -p "$PAIRS" "$ALGOS" "$MULTI" "$BGMODES"

if [[ ! -x "$BGBGONE" ]]; then
  echo "fatal: bgbgone binary not found at $BGBGONE" >&2
  exit 1
fi

echo "bgbgone: $($BGBGONE --version)"
echo "source : $SRC"
echo

# -----------------------------------------------------------------------------
# slug | algo | note
#
# algo:
#   auto      — default vn-mask (preferred)
#   person    — VNGeneratePersonSegmentationRequest
#   saliency  — VNGenerateObjectnessBasedSaliencyImageRequest
#   none      — no cutout produced (story explicitly has no foreground)
# -----------------------------------------------------------------------------
SLUGS=(
  "1839-cornelius-self-portrait|person|first selfie ever — single subject, plain backdrop"
  "1840-bayard-self-portrait|person|first staged photograph, drowned-man pose"
  "1864-nadar-sarah-bernhardt|person|invention of the controlled studio backdrop"
  "1878-muybridge-horse-in-motion|auto|engineered backdrop + multi-frame ancestor"
  "1920-hine-powerhouse-mechanic|person|single industrial worker against simple machinery"
  "1936-evans-allie-mae-burroughs|person|FSA portrait, female face of the Great Depression"
  "1972-cernan-on-the-moon|auto|astronaut on lunar surface — pure black sky background"
  "1984-mccandless-eva|auto|the HERO image"
  "1997-sojourner-on-mars|auto|first roving robot on another planet"
  "2015-curiosity-selfie|auto|on-device imaging 225M km away"
  "gallery-aldrin|auto|portrait — Buzz Aldrin, Apollo 11 visor (PD-NASA, centered, cropped)"
  "gallery-car|auto|car — pink Cadillac (CC0, centered)"
  "gallery-plane|auto|airplane — F-22 Raptor head-on (PD-USAF, centered)"
  "gallery-bison|auto|animal — Yellowstone bull bison portrait (PD, centered)"
)

# -----------------------------------------------------------------------------
# resample <input> <output> <max>
# -----------------------------------------------------------------------------
resample() {
  local in="$1" out="$2" max="$3"
  magick "$in" -auto-orient -strip -resize "${max}x${max}>" -quality 88 "$out"
}

# -----------------------------------------------------------------------------
# Manifest of (slug, algo) → ok/failed. Recreated every build; consumed by
# tests/static.test.mjs to enumerate which (.<algo>.cut.png) files must exist.
# -----------------------------------------------------------------------------
MANIFEST="$PAIRS/manifest.json"
echo '{"ok":[],"failed":[]}' > "$MANIFEST"
ok_list=()
fail_list=()

# -----------------------------------------------------------------------------
# pair_all_algos <slug>  — resamples the source and renders one cut per algo.
#
# Every (slug × {auto, person, saliency}) combination is attempted. When
# bgbgone exits non-zero for a combo (e.g. --algo person on a horse-in-motion
# frame returns "no person detected"), we *do not* invent a fallback — that
# would violate the no-fallbacks rule the whole project is built on. The
# missing file is recorded into manifest.json as a "failed" entry; the live
# <select> on the page renders that option but the JS surfaces "no honest
# cut produced for this combo" when the user picks it.
# -----------------------------------------------------------------------------
pair_all_algos() {
  local slug="$1" default_algo="$2"
  local src_in="$SRC/$slug.jpg"
  local src_out="$PAIRS/$slug.src.jpg"
  printf "pair   %-40s" "$slug"
  resample "$src_in" "$src_out" "$MAX"
  # Per-slug post-resample crop overrides — keeps the subject centred in
  # the slider frame instead of inheriting the source's compositional
  # whitespace. Add slugs here only when claude-CLI audit-cuts.sh flags
  # them as off-centre. Format: tight square center-crop, optional
  # vertical offset for subjects that sit in the upper portion.
  case "$slug" in
    gallery-aldrin)
      # Iconic Aldrin visor: helmet in upper third, lunar surface fills
      # lower half. Crop a 2800x2800 square offset upward to focus on
      # the astronaut, then resample back to MAX.
      magick "$src_in" -auto-orient -strip -gravity center \
        -crop 2800x2800+0-200 +repage \
        -resize "${MAX}x${MAX}>" -quality 88 "$src_out"
      ;;
  esac
  if [[ "$default_algo" == "none" ]]; then
    rm -f "$PAIRS/$slug".*.cut.png
    printf " %s  (no cutout, by design)\n" "$(magick identify -format "%wx%h" "$src_out")"
    return
  fi
  local d_src
  d_src=$(magick identify -format "%wx%h" "$src_out")
  printf " %s\n" "$d_src"
  for algo in auto person saliency; do
    local cut_out="$PAIRS/$slug.$algo.cut.png"
    rm -f "$cut_out"
    if "$BGBGONE" "$src_out" --algo "$algo" --to png -o "$cut_out" --quiet 2>/dev/null && [[ -s "$cut_out" ]]; then
      local d_cut alpha
      d_cut=$(magick identify -format "%wx%h" "$cut_out")
      alpha=$(magick "$cut_out" -alpha extract -format '%[fx:mean]' info: 2>/dev/null)
      # bgbgone returns 0 even when the algorithm finds nothing (e.g.
      # --algo person on a car). The output is a 100%-transparent PNG.
      # Treat alpha-mean below 0.001 (less than 0.1% of pixels visible)
      # as "no honest cut" and remove the file — the picker JS will then
      # surface "no honest cut produced for this combo" instead of
      # silently swapping in an empty image that looks broken.
      if awk -v a="$alpha" 'BEGIN{exit !(a+0 < 0.001)}' </dev/null; then
        printf "       empty %s  (alpha-mean=%s, treating as honest miss)\n" "$algo" "$alpha"
        rm -f "$cut_out"
        fail_list+=("\"$slug/$algo\"")
      elif [[ "$d_src" != "$d_cut" ]]; then
        echo "       FAIL  $algo  src $d_src != cut $d_cut"
        rm -f "$cut_out"
        fail_list+=("\"$slug/$algo\"")
      else
        printf "       ok    %s  (%s, alpha-mean=%s)\n" "$algo" "$d_cut" "$alpha"
        ok_list+=("\"$slug/$algo\"")
      fi
    else
      printf "       miss  %s  (bgbgone produced no honest cut for this combo)\n" "$algo"
      rm -f "$cut_out"
      fail_list+=("\"$slug/$algo\"")
    fi
  done
}

# 1) ten timeline pairs × three algos
for entry in "${SLUGS[@]}"; do
  IFS="|" read -r slug default_algo _note <<<"$entry"
  pair_all_algos "$slug" "$default_algo"
done

# Write manifest of attempted (slug, algo) outcomes.
{
  printf '{"ok":['
  (IFS=,; printf '%s' "${ok_list[*]}")
  printf '],"failed":['
  (IFS=,; printf '%s' "${fail_list[*]}")
  printf ']}\n'
} > "$MANIFEST"
echo "manifest: $MANIFEST  (${#ok_list[@]} ok, ${#fail_list[@]} failed)"
echo

# 2) algorithm-card demos
algo_demo() {
  local algo="$1" src_pair="$2" out_slug="$3"
  local src_in="$PAIRS/$src_pair.src.jpg"
  local src_out="$ALGOS/$out_slug.src.png"
  local cut_out="$ALGOS/$out_slug.cut.png"
  printf "algo   %-40s" "$out_slug"
  magick "$src_in" "$src_out"
  "$BGBGONE" "$src_in" --algo "$algo" --to png -o "$cut_out" --quiet
  local d_src d_cut
  d_src=$(magick identify -format "%wx%h" "$src_out")
  d_cut=$(magick identify -format "%wx%h" "$cut_out")
  if [[ "$d_src" != "$d_cut" ]]; then
    echo "FAIL: src $d_src != cut $d_cut"
    exit 1
  fi
  printf " %s  ok\n" "$d_src"
}
algo_demo "auto"     "2015-curiosity-selfie"          "vn-mask"
algo_demo "person"   "1920-hine-powerhouse-mechanic"  "person"
algo_demo "saliency" "1878-muybridge-horse-in-motion" "saliency"
echo

# 3) Muybridge — pre-crop 12 frames then bgbgone each.
# Note: vn-mask treats the original row as one connected foreground, so
# we honestly split first (the image *is* twelve separate photographs
# laid out as a grid) and run bgbgone over each frame. The page copy is
# explicit about this — not pretending --multi found 12 instances on its
# own.
echo "multi  muybridge horse-in-motion ..."
rm -f "$MULTI"/horse-*.png "$MULTI/source.png" "$MULTI/source.jpg" "$MULTI"/frame-*.jpg
cp "$PAIRS/1878-muybridge-horse-in-motion.src.jpg" "$MULTI/source.jpg"
magick "$MULTI/source.jpg" "$MULTI/source.png"
# Split into 4 columns × 3 rows = 12 frames using ImageMagick `-crop @`.
magick "$MULTI/source.jpg" -crop 4x3@ +repage +adjoin "$MULTI/frame-%02d.jpg"
i=0
for frame in "$MULTI"/frame-*.jpg; do
  i=$((i+1))
  out="$MULTI/horse-$(printf '%02d' "$i").png"
  # Use saliency — each frame's horse is small relative to the white
  # backdrop, so vn-mask can miss it; saliency reliably finds the horse.
  "$BGBGONE" "$frame" --algo saliency --to png -o "$out" --quiet || rm -f "$out"
done
n=$(ls "$MULTI"/horse-*.png 2>/dev/null | wc -l | tr -d ' ')
echo "       -> $n horse cutouts"
echo

# 3b) Real feather steps — six honest --feather renders for the demo slider.
mkdir -p "$ROOT/assets/feather"
for px in 0 2 6 12 18 24; do
  "$BGBGONE" "$PAIRS/1864-nadar-sarah-bernhardt.src.jpg" \
    --algo person --feather "$px" --to png \
    -o "$ROOT/assets/feather/feather-${px}.png" --quiet
done
echo "feather  6 real --feather renders"
echo

# 4) background-mode demos on The Blue Marble.
# Blue Marble (Apollo 17) is the named subject in the "Three backgrounds,
# one earth" demo. Three honest renders, three real CLI invocations the
# user can copy verbatim. The legacy astronaut renders are removed so the
# section can't show stale assets.
echo "bgmode blue marble ..."
BM_SRC="$PAIRS/blue-marble.src.jpg"
resample "$SRC/blue-marble.jpg" "$BM_SRC" "$MAX"
rm -f "$BGMODES"/transparent.png "$BGMODES"/amber.png "$BGMODES"/composite.png
"$BGBGONE" "$BM_SRC" -o "$BGMODES/blue-marble-transparent.png" --quiet
"$BGBGONE" "$BM_SRC" --bg color:#FFDD33 -o "$BGMODES/blue-marble-yellow.png" --quiet
"$BGBGONE" "$BM_SRC" --bg image:"$PAIRS/1878-muybridge-horse-in-motion.src.jpg" --bg-fit cover -o "$BGMODES/blue-marble-muybridge.png" --quiet
echo "       blue-marble transparent + yellow + on-muybridge"
echo

# 5) OG card
echo "og     1200x630 card ..."
FONT=/System/Library/Fonts/Helvetica.ttc
magick -size 1200x630 xc:'#0C0C10' \
  \( "$PAIRS/1984-mccandless-eva.auto.cut.png" -resize 540x540 \) -gravity center -geometry +260+0 -composite \
  -font "$FONT" -fill '#F4EFE2' -pointsize 96 -gravity west -annotate +80-100 "bgbgone" \
  -font "$FONT" -fill '#FF3D7F' -pointsize 32 -gravity west -annotate +80-20 "background, be gone." \
  -font "$FONT" -fill '#FFDD33' -pointsize 22 -gravity west -annotate +80+40 "the unix background remover for macOS" \
  -font "$FONT" -fill '#C9C4B8' -pointsize 18 -gravity west -annotate +80+90 "brew install Arthur-Ficial/tap/bgbgone" \
  "$ROOT/assets/og.png"
echo

# 6) help snapshot
"$BGBGONE" --help > "$ROOT/assets/help.txt"
echo "help   $(wc -l < "$ROOT/assets/help.txt") lines captured"

echo
echo "ok — build-assets done"
