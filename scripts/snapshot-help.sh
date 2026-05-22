#!/usr/bin/env bash
#
# snapshot-help.sh — captures `bgbgone --help` to assets/help.txt
# verbatim so the page can inline the exact CLI surface that ships in the
# currently-installed binary. Run on every build.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BGBGONE="${BGBGONE:-/opt/homebrew/bin/bgbgone}"
"$BGBGONE" --help > "$ROOT/assets/help.txt"
echo "wrote $(wc -l < "$ROOT/assets/help.txt") lines to assets/help.txt"
