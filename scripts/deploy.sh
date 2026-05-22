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
for sub in showcase pairs algos multi bgmodes feather; do
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

echo "dist tree:"
du -sh "$DIST"/* "$DIST"/assets/* 2>/dev/null | sed 's@'"$DIST"'@dist@'

echo
echo "deploying ..."
cd "$ROOT"
wrangler pages deploy "$DIST" --project-name bgbgone-web --branch main --commit-dirty=true
