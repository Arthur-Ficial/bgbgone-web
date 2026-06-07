#!/usr/bin/env node
/* ==========================================================================
   visual-ai.test.mjs — per-section visual rubric (mobile + desktop)
   --------------------------------------------------------------------------
   The "fresh pair of eyes" gate. For every named section we capture a
   full-section screenshot at iPhone-14-Pro and at desktop, then ask Claude
   to score it against a single uniform rubric (coherence, palette, contrast,
   no AI tropes, no overflow, interactive controls look interactive).

   AUTH: this routes through the local **`claude` CLI** (Claude Code), which
   uses the machine's Claude subscription via the keychain — NO
   `ANTHROPIC_API_KEY` required. The CLI reads the saved screenshot with its
   Read tool and returns the JSON verdict. Skips with a clear message only if
   the `claude` binary is not on PATH.

   Saves screenshots under tests/screens/vai-<section>-<viewport>.png for
   inspection. Fails on the first rubric.pass = false (with the reasons), so
   the output points right at what needs fixing.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './_serve.mjs';

const execFileP = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'tests/screens');
mkdirSync(SHOTS, { recursive: true });

/* The page is a LIGHT, warm "darkroom safelight" theme. Describe it precisely
   so the judge does not false-fail the deliberately bold colour panels. */
const RUBRIC = `You are auditing one section of the bgbgone landing page — a hand-authored,
LIGHT-themed product page for a macOS background-remover CLI.

Reply with a SINGLE-LINE JSON object and nothing else:
{"pass": true|false, "fails": ["short reason", ...], "section": "<echo the section id>"}

The intended design (NOT failures):
- Warm cream / paper background (~#FFFBF0) with near-black aubergine ink text (~#1A1015).
- Two brand accents: raspberry pink (~#E91E63) and honey yellow (~#FFC107).
- Some sections are deliberately FULL-BLEED bold panels: a deep-pink server panel with
  cream text, a solid-yellow privacy panel with dark text, dark "terminal" code blocks
  with cream/yellow monospace text, and a near-black call-to-action. These are intentional
  and high-contrast — do NOT flag them as off-palette or low-contrast.

Score the section against ALL of:
1. Coherence — heading, copy, imagery and any CLI strings describe the same subject; no
   mismatched before/after; no obviously broken or empty layout.
2. Palette — only cream / ink / raspberry-pink / honey-yellow (plus the dark terminal
   panels). NO purple, NO generic "AI" rainbow/gradient slop.
3. Contrast — visible text is comfortably readable (WCAG AA at a glance).
4. No emoji; no named cloud background-removal competitor brands; no fake "AI generated" tropes.
5. Nothing clipped, overlapping, or running off-screen for the given viewport.
6. Interactive controls (the before/after slider, subject buttons, algorithm toggle, copy
   buttons, links) look interactive — real hit-area, visible affordance, readable labels.

If pass = false, "fails" MUST list each broken item by short label. If pass = true, "fails"
MUST be an empty array. Be fair: only fail on genuine, visible problems.`;

const SECTIONS = [
  { id: 'hero',      sel: '.hero' },
  { id: 'gallery',   sel: '.gallery' },
  { id: 'stats',     sel: '.stats' },
  { id: 'examples',  sel: '#examples' },
  { id: 'flags',     sel: '#flags' },
  { id: 'privacy',   sel: '.privacy' },
  { id: 'ecosystem', sel: '#ecosystem' },
  { id: 'footer',    sel: '.footer' },
];

const VIEWPORTS = [
  { name: 'mobile',  ...devices['iPhone 14 Pro'] },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 desktop-test' },
];

async function claudeAvailable() {
  try { await execFileP('claude', ['--version'], { timeout: 20_000 }); return true; }
  catch { return false; }
}

/* Ask the local Claude CLI (subscription auth) to judge a saved screenshot.
   We read EVERY assistant turn (stream-json), not just the final `result`,
   because a Stop hook on the host can append a "nothing left to do" epilogue
   that would otherwise bury the verdict line. */
async function judge(shotPath, section, viewport) {
  const prompt =
    `${RUBRIC}\n\nRead the image file at ${shotPath}. ` +
    `It is the "${section}" section of the page at the ${viewport} viewport. ` +
    `Output ONLY the single-line JSON verdict as your reply.`;
  const { stdout } = await execFileP(
    'claude',
    ['-p', prompt, '--model', 'claude-sonnet-4-6', '--output-format', 'stream-json', '--verbose', '--allowedTools', 'Read'],
    { maxBuffer: 32 * 1024 * 1024, timeout: 150_000 },
  );
  // gather all assistant text + final result across the whole transcript
  let blob = '';
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
      for (const c of ev.message.content) if (c.type === 'text' && c.text) blob += '\n' + c.text;
    }
    if (ev.type === 'result' && typeof ev.result === 'string') blob += '\n' + ev.result;
  }
  // verdict JSON is flat (fails is a string array — no nested braces)
  const objs = blob.match(/\{[^{}]*\}/g) || [];
  const raw = objs.reverse().find(o => /"pass"\s*:/.test(o));
  if (!raw) return { pass: false, fails: [`no JSON verdict found in transcript: ${blob.slice(-200)}`] };
  try { return JSON.parse(raw); }
  catch { return { pass: false, fails: [`unparseable verdict: ${raw.slice(0, 200)}`] }; }
}

test('visual-AI per-section rubric (via Claude CLI / subscription)', { timeout: 900_000 }, async () => {
  if (!(await claudeAvailable())) {
    console.log('SKIP: `claude` CLI not found on PATH');
    return;
  }
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
      // force lazy imagery to load so sections render fully before capture
      await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; }));
      await page.evaluate(async () => { await Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))); });
      await page.waitForTimeout(400);

      for (const sec of SECTIONS) {
        const handle = await page.$(sec.sel);
        if (!handle) { failures.push(`${sec.id} (${v.name}): selector ${sec.sel} not found`); continue; }
        const shotPath = join(SHOTS, `vai-${sec.id}-${v.name}.png`);
        await handle.screenshot({ path: shotPath });

        const verdict = await judge(shotPath, sec.id, v.name);
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
