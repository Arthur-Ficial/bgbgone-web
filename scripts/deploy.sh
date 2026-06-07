#!/usr/bin/env bash
#
# deploy.sh — assemble a clean dist/ (no >25 MiB source files) and
# deploy to Cloudflare Pages.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"

rm -rf "$DIST"
mkdir -p "$DIST/assets"

# Top-level files
for f in index.html style.css app.js; do
  cp "$ROOT/$f" "$DIST/$f"
done

# Vendor (MIT slider)
cp -R "$ROOT/vendor" "$DIST/vendor"

# Asset subdirs that ARE served at runtime
for sub in showcase pairs algos multi bgmodes feather app; do
  if [ -d "$ROOT/assets/$sub" ]; then
    cp -R "$ROOT/assets/$sub" "$DIST/assets/$sub"
  fi
done
cp "$ROOT/assets/og.png" "$DIST/assets/og.png"
cp "$ROOT/assets/help.txt" "$DIST/assets/help.txt"

# Strict-PD license rollup (the LICENSES.md only, no big source originals)
mkdir -p "$DIST/assets/sources"
cp "$ROOT/assets/sources/LICENSES.md" "$DIST/assets/sources/LICENSES.md"
cp "$ROOT/assets/sources/CHECKSUMS.sha256" "$DIST/assets/sources/CHECKSUMS.sha256"

# robots + headers
cat > "$DIST/robots.txt" <<EOF
User-agent: *
Allow: /
Sitemap: https://bgbgone.franzai.com/sitemap.xml
EOF
cat > "$DIST/sitemap.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://bgbgone.franzai.com/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>
EOF
cat > "$DIST/_headers" <<EOF
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/vendor/*
  Cache-Control: public, max-age=31536000, immutable
/style.css
  Cache-Control: public, max-age=0, must-revalidate
/app.js
  Cache-Control: public, max-age=0, must-revalidate
/index.html
  Cache-Control: public, max-age=0, must-revalidate
/
  Cache-Control: public, max-age=0, must-revalidate
EOF

# -----------------------------------------------------------------------------
# Automatic cache-busting over EVERYTHING — css, js, the vendored slider, AND
# every image. One content version (md5 over all deployed asset bytes) is
# stamped as ?v=<hash> onto every local URL in index.html and exposed as
# <html data-v="..."> so app.js can version the gallery images it builds at
# runtime too. index.html is always revalidated (see _headers), so any device
# that reloads gets the new version and refetches every changed file. Nothing
# can be served stale.
# -----------------------------------------------------------------------------
python3 - "$DIST" <<'PY'
import sys, os, re, hashlib, glob
dist = sys.argv[1]

# Version = hash of every deployed asset + css + js + vendor. Changes whenever
# any byte of any of them changes.
files = [dist + '/style.css', dist + '/app.js']
files += sorted(glob.glob(dist + '/vendor/**/*', recursive=True))
files += sorted(glob.glob(dist + '/assets/**/*', recursive=True))
g = hashlib.md5()
for f in files:
    if os.path.isfile(f):
        g.update(f.encode()); g.update(open(f, 'rb').read())
V = g.hexdigest()[:12]

p = dist + '/index.html'
html = open(p, encoding='utf-8').read()

# Stamp ?v=V on every LOCAL css/js/image/vendor URL (skip absolute + data:).
def repl(m):
    attr, base = m.group(1), m.group(2)
    if base.startswith('http') or base.startswith('data:'):
        return m.group(0)
    return f'{attr}="{base}?v={V}"'
html = re.sub(
    r'(src|href)="([^"?]+\.(?:png|jpg|jpeg|webp|avif|gif|svg|css|js|txt))(?:\?v=[^"]*)?"',
    repl, html)

# Expose V to app.js for the runtime-built gallery image URLs.
html = re.sub(r'<html lang="en"[^>]*>', f'<html lang="en" data-v="{V}">', html, count=1)

open(p, 'w', encoding='utf-8').write(html)
n = len(re.findall(r'\?v=' + re.escape(V), html))
print(f'cache-bust: ?v={V} on {n} local URLs (css/js/vendor/images) + data-v for runtime gallery')
PY

echo "dist tree:"
du -sh "$DIST"/* "$DIST"/assets/* 2>/dev/null | sed 's@'"$DIST"'@dist@'

echo
echo "deploying ..."
cd "$ROOT"
wrangler pages deploy "$DIST" --project-name bgbgone-web --branch main --commit-dirty=true
