#!/usr/bin/env node
/* ==========================================================================
   clicks.test.mjs — click EVERY interactive element, on desktop AND mobile
   --------------------------------------------------------------------------
   The brute-force "does anything throw / does every control do something"
   gate. It enumerates every clickable on the page and exercises it:

     - every nav / in-page / footer link            (no error, resolves)
     - every subject button in the live demo         (switches, stays aligned)
     - every algorithm button                        (swaps to a real cut)
     - every copy button                             (writes to clipboard)
     - both example sliders + the hero slider        (present, aligned)

   It fails on ANY uncaught page error or console error across the whole run,
   and on any control that does not do its job.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './_serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1280, height: 900 } },
  { name: 'mobile',  ...devices['iPhone 14 Pro'] },
];

/* every img-comparison-slider must render its before & after at the same box */
async function assertSlidersAligned(page, fails, label) {
  const bad = await page.$$eval('img-comparison-slider', sliders =>
    sliders.map((s, i) => {
      const imgs = s.querySelectorAll('img');
      if (imgs.length < 2) return { i, reason: 'fewer than 2 images' };
      const a = imgs[0].getBoundingClientRect(), b = imgs[1].getBoundingClientRect();
      const dw = Math.abs(Math.round(a.width) - Math.round(b.width));
      const dh = Math.abs(Math.round(a.height) - Math.round(b.height));
      if (dw > 1 || dh > 1) return { i, reason: `before ${Math.round(a.width)}x${Math.round(a.height)} vs after differ ${dw}x${dh}px` };
      if (a.width < 10 || a.height < 10) return { i, reason: 'slider collapsed' };
      return null;
    }).filter(Boolean));
  for (const b of bad) fails.push(`${label}: slider #${b.i} ${b.reason}`);
}

test('every clickable element works and nothing throws', { timeout: 240_000 }, async () => {
  const server = await startServer({ root: ROOT });
  const browser = await chromium.launch();
  const failures = [];

  try {
    for (const v of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: v.viewport, userAgent: v.userAgent,
        deviceScaleFactor: v.deviceScaleFactor, isMobile: v.isMobile, hasTouch: v.hasTouch,
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(`PAGEERROR ${e.message}`));
      page.on('console', m => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });

      await page.goto(server.url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => customElements.get('img-comparison-slider') !== undefined);
      const tag = v.name;

      /* ---- links: every <a href> must have a real target (no dead clicks) ---- */
      const links = await page.$$eval('a[href]', as => as.map(a => ({
        href: a.getAttribute('href'),
        text: (a.textContent || '').trim().slice(0, 30),
        hasName: !!((a.textContent || '').trim() || a.getAttribute('aria-label')),
      })));
      for (const l of links) {
        if (!l.hasName) failures.push(`${tag}: link "${l.href}" has no accessible name`);
        if (l.href.startsWith('#') && l.href.length > 1) {
          const found = await page.$(l.href);
          if (!found) failures.push(`${tag}: in-page link ${l.href} points at no element`);
        }
        if (l.href === '#' || l.href === '') failures.push(`${tag}: empty/dead link href ("${l.text}")`);
      }

      /* ---- copy buttons: clicking writes the advertised text to clipboard ---- */
      const copyBtns = await page.$$('[data-copy]');
      for (let i = 0; i < copyBtns.length; i++) {
        const want = await copyBtns[i].getAttribute('data-copy');
        await copyBtns[i].click();
        await page.waitForTimeout(120);
        const got = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
        if (got !== null && want && got.trim() !== want.trim())
          failures.push(`${tag}: copy button ${i} wrote "${(got||'').slice(0,40)}" != "${want}"`);
        const flashed = await copyBtns[i].evaluate(el => el.classList.contains('copied'));
        if (!flashed) failures.push(`${tag}: copy button ${i} gave no "copied" feedback`);
      }

      /* ---- the live demo: click every subject, then every visible algo ---- */
      const subjects = await page.$$eval('.subj', els => els.map(e => e.dataset.subject));
      for (const s of subjects) {
        await page.click(`.subj[data-subject="${s}"]`);
        await page.waitForTimeout(200);
        const active = await page.$eval('.subj.is-active', e => e.dataset.subject);
        if (active !== s) failures.push(`${tag}: clicking subject ${s} did not make it active (got ${active})`);

        const algos = await page.$$eval('.algo', els => els.filter(e => !e.hidden).map(e => e.dataset.algo));
        if (!algos.length) failures.push(`${tag}: subject ${s} exposes no algorithm buttons`);
        for (const algo of algos) {
          await page.click(`.algo[data-algo="${algo}"]`);
          await page.waitForTimeout(150);
          const r = await page.evaluate(() => {
            const a = document.getElementById('demo-before'), c = document.getElementById('demo-after');
            const ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect();
            return {
              after: c.getAttribute('src'),
              cli: (document.getElementById('demo-cli')?.textContent || '').trim(),
              decoded: c.complete && c.naturalWidth > 0 && a.complete && a.naturalWidth > 0,
              dw: Math.abs(Math.round(ra.width) - Math.round(rc.width)),
              dh: Math.abs(Math.round(ra.height) - Math.round(rc.height)),
            };
          });
          const t = `${tag}/${s}/${algo}`;
          if (!r.after.endsWith(`${s}.${algo}.cut.png`)) failures.push(`${t}: after src wrong (${r.after})`);
          if (!existsSync(join(ROOT, r.after.replace(/^\//, '')))) failures.push(`${t}: after file missing`);
          if (!r.decoded) failures.push(`${t}: an image failed to decode`);
          if (r.dw > 1 || r.dh > 1) failures.push(`${t}: slider misaligned by ${r.dw}x${r.dh}px`);
          if (!r.cli.includes(algo)) failures.push(`${t}: CLI readout "${r.cli}" missing algo`);
        }
      }

      /* ---- all three sliders must be aligned in their current state ---- */
      await assertSlidersAligned(page, failures, tag);

      if (errors.length) failures.push(`${tag}: ${errors.length} runtime error(s): ${errors.slice(0,3).join(' | ')}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }

  assert.equal(failures.length, 0, `${failures.length} click/interaction problem(s):\n  ` + failures.join('\n  '));
});
