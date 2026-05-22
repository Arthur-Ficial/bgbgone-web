#!/usr/bin/env node
/* ==========================================================================
   mobile.test.mjs — mobile-first overflow lint + axe color-contrast lint
   --------------------------------------------------------------------------
   The CLAUDE.md rule "mobile-first, nothing renders off the left/right edge"
   is enforced here by *measuring* — not by parsing CSS for max-width vs
   min-width queries. Every visible element inside <main> and <footer> has
   its getBoundingClientRect() compared to the viewport: if rect.right
   exceeds viewport width or rect.left is negative, that's the offending
   selector and we fail with its rect for easy fix.

   Run at iPhone 14 Pro (390×844) AND desktop (1440×900) — catches the
   inverse "mobile-first broke desktop" regression too.

   Then axe-core's color-contrast rule sweeps both viewports — failing any
   WCAG AA contrast violation. Same Playwright session for speed.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { startServer } from './_serve.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORTS = [
  { name: 'mobile',  ...devices['iPhone 14 Pro'] },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 desktop-test' },
];

test('mobile-first overflow + axe color-contrast', async (t) => {
  const server = await startServer({ root: ROOT });
  const browser = await chromium.launch();

  try {
    for (const v of VIEWPORTS) {
      await t.test(`${v.name} (${v.viewport?.width || v.viewport?.width}×${v.viewport?.height || v.viewport?.height})`, async (tt) => {
        const context = await browser.newContext({
          viewport: v.viewport,
          userAgent: v.userAgent,
          deviceScaleFactor: v.deviceScaleFactor,
          isMobile: v.isMobile,
          hasTouch: v.hasTouch,
        });
        const page = await context.newPage();
        await page.goto(server.url, { waitUntil: 'networkidle' });
        // Let the deferred custom element upgrade and any image-driven
        // layout-shift settle before we measure.
        await page.waitForLoadState('domcontentloaded');
        await page.waitForFunction(() => customElements.get('img-comparison-slider') !== undefined);
        await page.waitForTimeout(300);

        await tt.test('no element overflows the viewport horizontally', async () => {
          const width = v.viewport.width;
          const offenders = await page.evaluate((vw) => {
            const EPS = 0.5;
            const skip = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD']);
            const all = Array.from(document.querySelectorAll('main *, footer *'));
            // An element is OK if any ancestor scroll-clips overflow on the
            // x-axis. <pre overflow-x:auto> holding a wide <code> is fine
            // — the user scrolls the <pre>; the <code> never reaches the
            // viewport edge. We only flag elements that *actually* push
            // their way past the viewport edge with no scroll containment.
            const isScrollClippedAncestor = (el) => {
              for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
                const cs = getComputedStyle(p);
                if (['auto', 'scroll', 'hidden', 'clip'].includes(cs.overflowX) ||
                    ['auto', 'scroll', 'hidden', 'clip'].includes(cs.overflow)) {
                  return true;
                }
              }
              return false;
            };
            const out = [];
            for (const el of all) {
              if (skip.has(el.tagName)) continue;
              const cs = getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden') continue;
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              if (r.right <= vw + EPS && r.left >= -EPS) continue;
              if (isScrollClippedAncestor(el)) continue;
              let sel = el.tagName.toLowerCase();
              if (el.id) sel += '#' + el.id;
              if (el.className && typeof el.className === 'string') {
                sel += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
              }
              out.push({
                selector: sel,
                left: Math.round(r.left * 10) / 10,
                right: Math.round(r.right * 10) / 10,
                width: Math.round(r.width * 10) / 10,
              });
            }
            return out;
          }, width);
          assert.equal(offenders.length, 0,
            `${offenders.length} element(s) overflow ${width}px viewport:\n` +
            offenders.slice(0, 12).map(o =>
              `  ${o.selector}  left=${o.left}  right=${o.right}  width=${o.width}`).join('\n'));
        });

        await tt.test('axe color-contrast passes WCAG AA', async () => {
          const results = await new AxeBuilder({ page })
            .withRules(['color-contrast'])
            .analyze();
          const violations = results.violations;
          if (violations.length) {
            const detail = violations.flatMap(v =>
              v.nodes.map(n => `  ${v.id}: ${n.target.join(' ')}\n    ${n.failureSummary?.replace(/\n/g, '\n    ') || ''}`)
            ).join('\n');
            assert.fail(`axe color-contrast violations on ${v.name}:\n${detail}`);
          }
        });

        await context.close();
      });
    }
  } finally {
    await browser.close();
    await server.close();
  }
});
