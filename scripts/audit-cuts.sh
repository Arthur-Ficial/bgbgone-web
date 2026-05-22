#!/usr/bin/env bash
# audit-cuts.sh — claude-CLI visual QA of every .cut.png the live page shows.
# Writes a JSON verdict file and a human report.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAIRS="$ROOT/assets/pairs"
ALGOS="$ROOT/assets/algos"
BGMODES="$ROOT/assets/bgmodes"
REPORT="$ROOT/assets/pairs/audit.json"

# Files actually shown on the live page:
#   4 gallery slugs × 3 algos                = 12
#   3 algo demo cards (single .cut.png each) = 3
#   3 Blue Marble bgmode renders             = 3
#   --------                                = 18 total
FILES=()
for slug in gallery-car gallery-plane gallery-aldrin gallery-bison; do
  for algo in auto person saliency; do
    FILES+=("$PAIRS/$slug.$algo.cut.png")
  done
done
FILES+=(
  "$ALGOS/vn-mask.cut.png"
  "$ALGOS/person.cut.png"
  "$ALGOS/saliency.cut.png"
  "$BGMODES/blue-marble-transparent.png"
  "$BGMODES/blue-marble-yellow.png"
  "$BGMODES/blue-marble-muybridge.png"
)

PROMPT_HEAD='Read this image. It is the OUTCOME of a background-removal step (or a background-replacement step). Reply with EXACTLY ONE LINE in this format:
GOOD short-reason
or
BAD  short-reason
Use GOOD when: the foreground subject is fully present and recognisable, edges are reasonable, background is transparent (alpha checker) or replaced as intended.
Use BAD when: subject is missing/torn, large patches of the original background remain, OR the subject is heavily off-centre (more than ~30% from frame centre).
Path:'

results_good=()
results_bad=()
for f in "${FILES[@]}"; do
  base=$(basename "$f")
  if [[ ! -f "$f" ]]; then
    results_bad+=("$base — file missing")
    printf "MISS %s\n" "$base"
    continue
  fi
  # Pipe prompt+path via stdin so shell quoting doesn't bite
  verdict_full=$(printf '%s %s\n' "$PROMPT_HEAD" "$f" \
    | claude -p --add-dir "$PAIRS" --add-dir "$ALGOS" --add-dir "$BGMODES" --allowedTools Read 2>/dev/null \
    | tail -1)
  word=$(printf "%s" "$verdict_full" | awk '{print toupper($1)}')
  if [[ "$word" == "GOOD" ]]; then
    results_good+=("$base — ${verdict_full#GOOD }")
    printf "GOOD  %s — %s\n" "$base" "${verdict_full#GOOD }"
  else
    results_bad+=("$base — ${verdict_full:-no-verdict}")
    printf "BAD   %s — %s\n" "$base" "${verdict_full:-no-verdict}"
  fi
done

# JSON report
{
  printf '{\n  "good": ['
  i=0; for x in "${results_good[@]}"; do (( i++ )) && printf ','; printf '\n    %s' "$(printf '%s' "$x" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')"; done
  printf '\n  ],\n  "bad": ['
  i=0; for x in "${results_bad[@]}"; do (( i++ )) && printf ','; printf '\n    %s' "$(printf '%s' "$x" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')"; done
  printf '\n  ]\n}\n'
} > "$REPORT"

echo
echo "GOOD=${#results_good[@]}  BAD=${#results_bad[@]}  → $REPORT"
