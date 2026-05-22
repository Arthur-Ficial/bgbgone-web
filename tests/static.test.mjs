#!/usr/bin/env node
/* ==========================================================================
   static.test.mjs — contract checks for bgbgone-web
   --------------------------------------------------------------------------
   Pure Node, no browser. Asserts the constitutional rules:
     - no external font hosts, no @font-face, no Google Fonts
     - no external CSS frameworks
     - no competitor brand names anywhere
     - no emoji codepoints
     - every <img src> resolves to a local file
     - every before/after pair has identical dimensions
   ========================================================================== */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };
const ok = (msg) => console.log(`ok   ${msg}`);

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const css  = readFileSync(join(ROOT, 'style.css'),  'utf8');
const js   = readFileSync(join(ROOT, 'app.js'),     'utf8');
const all  = [html, css, js].join('\n');

/* 1. external fonts / CDNs ------------------------------------------------ */
const FORBIDDEN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'use.typekit.net',
];
for (const host of FORBIDDEN_HOSTS) {
  if (all.toLowerCase().includes(host)) fail(`forbidden host present: ${host}`);
}
ok('no external font / CDN hosts');

if (/@font-face\s*{/i.test(css)) fail('@font-face rule present in style.css');
else ok('no @font-face rules');

if (/<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:/i.test(html)) {
  fail('remote stylesheet <link rel="stylesheet" href="https://...">');
} else ok('no remote stylesheet links');

/* 2. no competitor brand names ------------------------------------------- */
/* The denylist itself never spells the forbidden names — they are
   assembled from fragments so the test file is safe to grep across. */
const _frag = ['rem', 'ove', 'bg', 'u2', 'net', 'photo', 'room', 'clip', 'drop', 'cut', 'out', 'pro'];
const COMPETITORS = [
  _frag[0]+_frag[1]+'.'+_frag[2],          // r·e·m·o·v·e·.·b·g
  _frag[0]+_frag[1]+_frag[2],              // r·e·m·o·v·e·b·g
  _frag[0]+_frag[2],                       // r·e·m·b·g
  _frag[3]+_frag[4],                       // u·2·n·e·t
  _frag[5]+_frag[6],                       // p·h·o·t·o·r·o·o·m
  _frag[7]+_frag[8],                       // c·l·i·p·d·r·o·p
  _frag[9]+_frag[10]+'.'+_frag[11],        // c·u·t·o·u·t·.·p·r·o
];
for (const name of COMPETITORS) {
  if (new RegExp(name, 'i').test(all)) fail(`competitor brand name leaked: ${name}`);
}
ok('no competitor brand names');

/* 3. no emoji codepoints ------------------------------------------------- */
// Allowlist typographic arrows and similar glyphs that Unicode classifies as
// Extended_Pictographic but which are not emoji in any meaningful sense.
const ALLOWED = new Set(['↗','↘','↙','↖','↑','↓','←','→','↔','⁂','·','—','…']);
const found = [...all.matchAll(/\p{Extended_Pictographic}/gu)].map(m => m[0]).filter(c => !ALLOWED.has(c));
if (found.length) fail(`emoji codepoint found: ${[...new Set(found)].slice(0,5).join(' ')}`);
else ok('no emoji codepoints (only allowlisted typographic glyphs)');

/* 4. every <img src> resolves locally ----------------------------------- */
const imgSrcs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
const sliderSrcs = [...html.matchAll(/slot=["'](?:first|second)["'][^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
const srcs = [...new Set([...imgSrcs, ...sliderSrcs])];
let badSrc = 0;
for (const src of srcs) {
  if (/^https?:/.test(src)) { fail(`remote image src: ${src}`); badSrc++; continue; }
  const rel = src.replace(/^\//, '');
  if (!existsSync(join(ROOT, rel))) { fail(`missing local image: ${src}`); badSrc++; }
}
if (!badSrc) ok(`all ${srcs.length} <img src> values resolve locally`);

/* 5. before/after pair dimensions ---------------------------------------- */
function dims(path) {
  try { return execSync(`magick identify -format "%wx%h" "${path}"`).toString().trim(); }
  catch { return null; }
}

/* Timeline pairs: every slug has up to three per-algo cuts. Missing cuts
   are recorded in assets/pairs/manifest.json as honest "no cut produced
   for this combo" — we don't fail the test for them. We DO fail if a
   present cut has dim mismatch (the slider would render misaligned) and
   we fail if at least one algo (the default per slug) didn't render. */
// The four colour gallery slugs the live page actually shows. Each must
// have its default-algo cut present and any per-algo cuts that exist
// must match the src dimensions.
const TIMELINE = [
  ['gallery-car',     'auto'],
  ['gallery-plane',   'auto'],
  ['gallery-aldrin',  'auto'],
  ['gallery-bison',   'auto'],
];
const ALGOS = ['auto', 'person', 'saliency'];
let badPair = 0;
let presentCuts = 0;
for (const [slug, defaultAlgo] of TIMELINE) {
  const src = join(ROOT, 'assets/pairs', slug + '.src.jpg');
  if (!existsSync(src)) { fail(`missing src: ${slug}.src.jpg`); badPair++; continue; }
  const ds = dims(src);
  // Default-algo cut must exist (it's what the page initially shows).
  const defaultCut = join(ROOT, 'assets/pairs', `${slug}.${defaultAlgo}.cut.png`);
  if (!existsSync(defaultCut)) { fail(`missing default cut: ${slug}.${defaultAlgo}.cut.png`); badPair++; }
  for (const algo of ALGOS) {
    const cut = join(ROOT, 'assets/pairs', `${slug}.${algo}.cut.png`);
    if (!existsSync(cut)) continue; // honest miss, recorded in manifest
    presentCuts++;
    const dc = dims(cut);
    if (ds !== dc) { fail(`dim mismatch ${slug}.${algo}: src ${ds} != cut ${dc}`); badPair++; }
  }
}
// Algo demo cards: single cut per card (each one demos a specific algo).
const ALGO_CARDS = ['assets/algos/vn-mask', 'assets/algos/person', 'assets/algos/saliency'];
for (const base of ALGO_CARDS) {
  const src = join(ROOT, base + '.src.png');
  const cut = join(ROOT, base + '.cut.png');
  if (!existsSync(src)) { fail(`missing src: ${base}.src.png`); badPair++; continue; }
  if (!existsSync(cut)) { fail(`missing cut: ${base}.cut.png`); badPair++; continue; }
  const ds = dims(src), dc = dims(cut);
  if (ds !== dc) { fail(`dim mismatch ${base}: src ${ds} != cut ${dc}`); badPair++; }
}
if (!badPair) ok(`pair dims clean (${TIMELINE.length} timeline slugs · ${presentCuts} per-algo cuts · ${ALGO_CARDS.length} algo cards)`);

// Manifest exists and is parseable.
const manifestPath = join(ROOT, 'assets/pairs/manifest.json');
if (!existsSync(manifestPath)) fail('missing assets/pairs/manifest.json — rerun make build');
else {
  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(m.ok) || !Array.isArray(m.failed)) fail('manifest.json missing ok/failed arrays');
    else ok(`manifest: ${m.ok.length} ok, ${m.failed.length} honest misses`);
  } catch (e) { fail(`manifest.json unparseable: ${e.message}`); }
}

/* 6. SSOT palette: no hex / rgba outside :root in style.css -------------- */
{
  let inRoot = false;
  const offenders = [];
  css.split('\n').forEach((line, i) => {
    if (/^:root\s*\{/.test(line)) inRoot = true;
    if (inRoot && /^\}/.test(line)) { inRoot = false; return; }
    if (inRoot) return;
    if (/#[0-9A-Fa-f]{3,8}\b/.test(line) || /\brgba?\s*\(/.test(line)) {
      offenders.push(`L${i+1}: ${line.trim().slice(0,80)}`);
    }
  });
  if (offenders.length) fail(`SSOT violated — hex/rgba outside :root:\n  ${offenders.slice(0,5).join('\n  ')}`);
  else ok('SSOT palette — no hex/rgba outside :root');
}

/* 7. vendor + help present ----------------------------------------------- */
if (!existsSync(join(ROOT, 'vendor/img-comparison-slider.min.js'))) fail('vendor slider missing');
else ok('vendor slider present');
if (!existsSync(join(ROOT, 'assets/help.txt'))) fail('assets/help.txt missing');
else ok('bgbgone --help snapshot present');

if (!process.exitCode) {
  console.log('\nall static contract checks green');
}
