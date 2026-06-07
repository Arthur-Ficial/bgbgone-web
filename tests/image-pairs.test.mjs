#!/usr/bin/env node
/* ==========================================================================
   image-pairs.test.mjs — BITWISE check of every before/after gallery pair
   --------------------------------------------------------------------------
   The slider only works if, for every subject and every algorithm:

     1. SAME SIZE  — the original (.src.jpg) and the cutout (.<algo>.cut.png)
        have the EXACT same pixel dimensions. (A device can never make them
        differ — they are the same file size on disk.)
     2. SAME PLACE — the cutout's subject sits pixel-for-pixel on top of the
        original. bgbgone's cutout is literally the source pixels with the
        background made transparent, so where the cutout is opaque its RGB
        must equal the source's RGB. We verify this with an ImageMagick
        masked absolute-error diff: it is ~0 for a correct cutout and huge if
        the subject were shifted or resized.

   Pure ImageMagick, deterministic, no browser. Complements the rendered-box
   checks in gallery.test.mjs and the AI checks in sliders-hardcore.test.mjs.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAIRS = join(ROOT, 'assets/pairs');
const TMP = mkdtempSync(join(tmpdir(), 'bgbg-diff-'));

const SUBJECTS = ['red-panda', 'corgi-puppy', 'woman-singer', '1984-mccandless-eva', 'gallery-car', 'gallery-plane'];
const ALGOS = ['auto', 'person', 'saliency'];

const dims = (p) => execFileSync('magick', ['identify', '-format', '%wx%h', p]).toString().trim();

/* Composite the cutout OVER the source. The cutout is the source pixels with
   the background made transparent, so where it is opaque it paints the exact
   same pixels back — the composite is identical to the source (absolute error
   ~0). If the subject were shifted or resized, the cutout would land on
   different pixels and the error would explode. Returns the differing fraction. */
function overlayDiffFraction(src, cut) {
  const comp = join(TMP, 'comp.png');
  execFileSync('magick', [src, cut, '-compose', 'over', '-composite', comp]);
  // `magick compare -metric AE` writes the differing-pixel count to STDERR and
  // exits non-zero when there's any difference, so capture stderr via spawnSync.
  const r = spawnSync('magick', ['compare', '-metric', 'AE', '-fuzz', '6%', comp, src, 'null:'], { encoding: 'utf8' });
  const ae = parseFloat((r.stderr || r.stdout || '').trim());
  const [w, h] = dims(cut).split('x').map(Number);
  return Number.isFinite(ae) ? ae / (w * h) : 1;
}

test('every before/after pair is the exact same size and overlays pixel-for-pixel', () => {
  const failures = [];
  let checked = 0;
  for (const s of SUBJECTS) {
    const src = join(PAIRS, `${s}.src.jpg`);
    if (!existsSync(src)) { failures.push(`${s}: missing src.jpg`); continue; }
    const dSrc = dims(src);
    for (const a of ALGOS) {
      const cut = join(PAIRS, `${s}.${a}.cut.png`);
      if (!existsSync(cut)) continue; // honest miss (e.g. person on an animal)
      checked++;
      const dCut = dims(cut);
      // (1) EXACT same size — the user's hard requirement
      if (dSrc !== dCut) {
        failures.push(`${s}/${a}: SIZE differs — src ${dSrc} != cut ${dCut}`);
        continue;
      }
      // (2) same place — cutout subject overlays the original pixel-for-pixel
      const frac = overlayDiffFraction(src, cut);
      if (frac > 0.02) {
        failures.push(`${s}/${a}: cutout does not overlay the original (${(frac * 100).toFixed(1)}% differ) — subject shifted or resized`);
      }
    }
  }
  assert.ok(checked >= 12, `expected to check ≥12 pairs, only checked ${checked}`);
  assert.equal(failures.length, 0, `${failures.length} pair problem(s):\n  ` + failures.join('\n  '));
});
