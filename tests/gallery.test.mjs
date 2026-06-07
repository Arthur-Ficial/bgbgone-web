#!/usr/bin/env node
/* ==========================================================================
   gallery.test.mjs — the "Pick a subject. Pick an algorithm." live demo
   --------------------------------------------------------------------------
   This is the test that should have existed before the slider shipped broken.
   For EVERY subject and EVERY algorithm it asserts the two invariants that
   make the before/after slider actually work:

     1. ALIGNMENT — the "before" image and the "after" image render at the
        EXACT same on-screen box. If they differ by even a few pixels the
        divider reveals a vertically/horizontally shifted picture and the
        comparison is meaningless. (This is the bug the user hit: a forced
        4:3 frame + object-fit:contain sized the two slotted images
        differently.)
     2. HONESTY — only algorithm buttons whose real .cut.png exists are shown;
        switching subject/algo swaps to a real file that actually decodes.

   Pure Playwright, no AI. Runs at desktop and mobile widths.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './_serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* Expected algorithm availability per subject — person only appears where the
   Vision person-segmenter actually returned a mask (a real human). */
const EXPECT = {
  'red-panda':           ['auto', 'saliency'],
  'corgi-puppy':         ['auto', 'saliency'],
  'woman-singer':        ['auto', 'person', 'saliency'],
  '1984-mccandless-eva': ['auto', 'person', 'saliency'],
  'gallery-car':         ['auto', 'saliency'],
  'gallery-plane':       ['auto', 'saliency'],
};

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1200, height: 900 } },
  { name: 'mobile',  ...devices['iPhone 14 Pro'] },
];

test('gallery: every subject × algorithm aligns and is honest', { timeout: 180_000 }, async () => {
  const server = await startServer({ root: ROOT });
  const browser = await chromium.launch();
  const failures = [];

  try {
    for (const v of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: v.viewport, userAgent: v.userAgent,
        deviceScaleFactor: v.deviceScaleFactor, isMobile: v.isMobile, hasTouch: v.hasTouch,
      });
      const page = await ctx.newPage();
      await page.goto(server.url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => customElements.get('img-comparison-slider') !== undefined);

      for (const [subject, algos] of Object.entries(EXPECT)) {
        await page.click(`.subj[data-subject="${subject}"]`);
        await page.waitForTimeout(250);

        // visible algo buttons must equal the expected set, in any order
        const visible = await page.$$eval('.algo', els =>
          els.filter(e => !e.hidden).map(e => e.dataset.algo));
        const norm = a => [...a].sort().join(',');
        if (norm(visible) !== norm(algos)) {
          failures.push(`${v.name}/${subject}: visible algos [${visible}] != expected [${algos}]`);
        }

        for (const algo of algos) {
          await page.click(`.algo[data-algo="${algo}"]`);
          await page.waitForTimeout(200);
          const r = await page.evaluate(() => {
            const a = document.getElementById('demo-before');
            const c = document.getElementById('demo-after');
            const sl = document.getElementById('demo-slider');
            const fr = document.querySelector('.demo-frame');
            const ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect();
            const rs = sl.getBoundingClientRect(), rf = fr.getBoundingClientRect();
            const round = n => Math.round(n);
            return {
              afterSrc: c.getAttribute('src'),
              beforeOK: a.complete && a.naturalWidth > 0,
              afterOK: c.complete && c.naturalWidth > 0,
              beforeNat: a.naturalWidth + 'x' + a.naturalHeight,
              afterNat: c.naturalWidth + 'x' + c.naturalHeight,
              dw: Math.abs(round(ra.width) - round(rc.width)),
              dh: Math.abs(round(ra.height) - round(rc.height)),
              boxW: round(ra.width), boxH: round(ra.height),
              // slider must fit inside its frame on every viewport (the portrait
              // overflow-clip bug showed up only on narrow/tall devices)
              overflowR: round(rs.right - rf.right),
              overflowL: round(rf.left - rs.left),
              sliderW: round(rs.width), frameW: round(rf.width),
            };
          });

          const tag = `${v.name}/${subject}/${algo}`;
          if (r.overflowR > 1 || r.overflowL > 1)
            failures.push(`${tag}: slider overflows frame by L${r.overflowL}/R${r.overflowR}px (slider ${r.sliderW} vs frame ${r.frameW}) — would be clipped on this device`);
          // after src must point at the matching real file on disk
          const expectSuffix = `${subject}.${algo}.cut.png`;
          if (!r.afterSrc.endsWith(expectSuffix))
            failures.push(`${tag}: after src "${r.afterSrc}" != …${expectSuffix}`);
          const rel = r.afterSrc.replace(/^\//, '');
          if (!existsSync(join(ROOT, rel)))
            failures.push(`${tag}: after file missing on disk: ${rel}`);
          if (!r.beforeOK) failures.push(`${tag}: before image did not decode`);
          if (!r.afterOK)  failures.push(`${tag}: after image did not decode (${r.afterSrc})`);
          if (r.beforeNat !== r.afterNat)
            failures.push(`${tag}: natural size mismatch before ${r.beforeNat} != after ${r.afterNat}`);
          // THE INVARIANT: before and after render at the same box (≤1px slack)
          if (r.dw > 1 || r.dh > 1)
            failures.push(`${tag}: slider MISALIGNED — before ${r.boxW}x${r.boxH} vs after box differs by ${r.dw}x${r.dh}px`);
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }

  assert.equal(failures.length, 0,
    `${failures.length} gallery problem(s):\n  ` + failures.join('\n  '));
});
