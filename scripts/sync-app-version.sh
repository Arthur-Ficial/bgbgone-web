#!/usr/bin/env bash
#
# sync-app-version.sh — bake the latest bgbgone-app (GUI) release version into the
# download section of index.html.
#
# The site forbids runtime external fetches, so the version label is stamped at BUILD
# time, between <!--APPVER-->…<!--/APPVER--> markers. The download LINK itself uses
# GitHub's /releases/latest/download/ permalink, so it is always current regardless of
# this label. We fetch the latest tag via `gh`; offline, we leave the existing label
# untouched (never break the build over a label).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HTML="$ROOT/index.html"
APP_REPO="${APP_REPO:-Arthur-Ficial/bgbgone-app}"

VER="$(gh api "repos/${APP_REPO}/releases/latest" --jq .tag_name 2>/dev/null || true)"
if [ -z "$VER" ]; then
  echo "sync-app-version: could not reach GitHub for ${APP_REPO} latest release — leaving label unchanged" >&2
  exit 0
fi
case "$VER" in v*) ;; *) VER="v$VER" ;; esac

python3 - "$HTML" "$VER" <<'PY'
import re, sys
html_path, ver = sys.argv[1], sys.argv[2]
html = open(html_path, encoding='utf-8').read()
new, n = re.subn(r'<!--APPVER-->.*?<!--/APPVER-->', f'<!--APPVER-->{ver}<!--/APPVER-->', html)
if n == 0:
    print("sync-app-version: no <!--APPVER--> markers found", file=sys.stderr)
    sys.exit(1)
open(html_path, 'w', encoding='utf-8').write(new)
print(f"sync-app-version: stamped {ver} into {n} marker(s)")
PY
