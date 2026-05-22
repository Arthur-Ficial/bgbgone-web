#!/usr/bin/env node
/* ==========================================================================
   visual-ai.test.mjs — per-section Claude rubric (mobile + desktop)
   --------------------------------------------------------------------------
   The "fresh pair of eyes" gate. For every named section we capture a
   full-section screenshot at iPhone-14-Pro and at desktop, then ask
   Claude Sonnet 4.6 to score it against a single uniform rubric
   (coherence, palette, contrast, no AI tropes, no overflow, interactive
   controls look interactive). Prompt-cache the rubric so per-section
   calls only pay for the new image bytes.

   Saves screenshots under tests/screens/<section>-<viewport>.png for
   inspection. Fails the test on the first rubric.pass = false (with
   the reasons), so the output points right at what needs fixing.

   Requires ANTHROPIC_API_KEY in env. Skips with a clear message if
   absent so contributors without an API key can still run the rest of
   the suite.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { chromium, devices } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './_serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'tests/screens');
mkdirSync(SHOTS, { recursive: true });

const RUBRIC = `You are auditing one section of the bgbgone landing page.
Reply with a single JSON object on one line:
{"pass": true|false, "fails": ["reason 1","reason 2"], "section": "<echo back the section id>"}

Score the section against ALL of:
1. Coherence — title, copy, imagery, and any CLI strings describe the same subject (no astronaut-vs-earth mismatch, no algo mismatch, no broken layout).
2. Palette — near-black canvas, cream text, yellow (#FFDD33) and hot pink (#FF3D7F) accents. No purple, no generic "AI gradient" gradients.
3. Contrast — every visible text passes WCAG AA at a glance.
4. No emoji, no competitor brand names of any cloud-AI background-removal service, no fake "AI generated" tropes.
5. No element appears clipped, overlapping, or off-screen for the given viewport.
6. Interactive controls (sliders, selects, tabs, copy buttons) look interactive (have hit-area, visible affordance, AA contrast).

If pass = false, fails MUST list each broken item by short label.
If pass = true, fails MUST be an empty array.`;

const SECTIONS = [
  { id: 'hero',       sel: '.hero' },
  { id: 'manifesto',  sel: '.manifesto' },
  { id: 'algorithms', sel: '#algorithms' },
  { id: 'demos',      sel: '#demos' },
  { id: 'formats',    sel: '.formats' },
  { id: 'install',    sel: '#install' },
  { id: 'cliref',     sel: '.cliref' },
  { id: 'ecosystem',  sel: '.ecosystem' },
  { id: 'footer',     sel: 'footer.site-footer' },
];

const VIEWPORTS = [
  { name: 'mobile',  ...devices['iPhone 14 Pro'] },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 desktop-test' },
];

test('visual-AI per-section rubric', { timeout: 600_000 }, async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('SKIP: ANTHROPIC_API_KEY not set');
    return;
  }
  const anthropic = new Anthropic();
  const server = await startServer({ root: ROOT });
  const browser = await chromium.launch();
  const failures = [];

  try {
    for (const v of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: v.viewport,
        userAgent: v.userAgent,
        deviceScaleFactor: v.deviceScaleFactor,
        isMobile: v.isMobile,
        hasTouch: v.hasTouch,
      });
      const page = await context.newPage();
      await page.goto(server.url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => customElements.get('img-comparison-slider') !== undefined);
      await page.waitForTimeout(300);

      for (const sec of SECTIONS) {
        const handle = await page.$(sec.sel);
        if (!handle) {
          failures.push(`${sec.id} (${v.name}): selector ${sec.sel} not found`);
          continue;
        }
        const shotPath = join(SHOTS, `vai-${sec.id}-${v.name}.png`);
        await handle.screenshot({ path: shotPath });
        const imgBytes = (await handle.screenshot()).toString('base64');

        const msg = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          system: [{
            type: 'text',
            text: RUBRIC,
            cache_control: { type: 'ephemeral' },
          }],
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imgBytes } },
              { type: 'text', text: `section: ${sec.id}\nviewport: ${v.name} (${v.viewport.width}x${v.viewport.height})` },
            ],
          }],
        });
        const txt = msg.content.find(b => b.type === 'text')?.text || '';
        let verdict;
        try { verdict = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || txt); }
        catch { verdict = { pass: false, fails: [`unparseable response: ${txt.slice(0, 200)}`] }; }
        if (!verdict.pass) {
          failures.push(`${sec.id} (${v.name}) [shot ${shotPath}]: ${verdict.fails?.join('; ') || 'no reason given'}`);
        } else {
          console.log(`ok   ${sec.id.padEnd(12)} ${v.name}`);
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }

  assert.equal(failures.length, 0, `${failures.length} section(s) failed visual-AI rubric:\n  ` + failures.join('\n  '));
});
