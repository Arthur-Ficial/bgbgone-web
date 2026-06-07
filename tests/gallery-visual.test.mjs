#!/usr/bin/env node
/* ==========================================================================
   gallery-visual.test.mjs — AI eyes on the "Pick a subject" slider
   --------------------------------------------------------------------------
   The deterministic gallery.test.mjs proves the before/after boxes are the
   same size. This test adds a second opinion: it screenshots the live demo
   stage for several subjects (landscape, portrait, square, person) and asks
   the local Claude CLI whether the two halves of the slider form ONE
   continuous, correctly-aligned picture — i.e. it would have caught the
   "right half is shifted / cut off" breakage by eye.

   AUTH: routes through the `claude` CLI (subscription), no ANTHROPIC_API_KEY.
   Skips cleanly if `claude` is not on PATH.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
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

const SUBJECTS = ['red-panda', 'corgi-puppy', 'woman-singer', '1984-mccandless-eva'];

const RUBRIC = `You are looking at a single before/after comparison slider from a background-removal
tool. The LEFT of the pink divider shows an original photo; the RIGHT shows the
SAME photo with its background removed (a grey/white checkerboard means
transparency — that is correct and expected).

The slider is CORRECT when the subject (the animal / person / object) is ONE
continuous shape across the divider: its body lines up at the same height and
position on both sides, as if a single picture were split by the divider.

The slider is BROKEN when the right half is visibly shifted up/down or
sideways relative to the left, or the subject is cut off / doubled / does not
continue across the divider.

Reply with ONE line of JSON and nothing else:
{"pass": true|false, "reason": "short"}
pass=true ONLY if the two halves form one continuous, aligned subject.`;

async function claudeAvailable() {
  try { await execFileP('claude', ['--version'], { timeout: 20_000 }); return true; }
  catch { return false; }
}

async function judge(shotPath, subject) {
  const prompt = `${RUBRIC}\n\nRead the image at ${shotPath}. It is the "${subject}" slider. Output ONLY the JSON verdict.`;
  const { stdout } = await execFileP('claude',
    ['-p', prompt, '--model', 'claude-sonnet-4-6', '--output-format', 'stream-json', '--verbose', '--allowedTools', 'Read'],
    { maxBuffer: 32 * 1024 * 1024, timeout: 150_000 });
  let blob = '';
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'assistant' && Array.isArray(ev.message?.content))
      for (const c of ev.message.content) if (c.type === 'text' && c.text) blob += '\n' + c.text;
    if (ev.type === 'result' && typeof ev.result === 'string') blob += '\n' + ev.result;
  }
  const objs = blob.match(/\{[^{}]*\}/g) || [];
  const raw = objs.reverse().find(o => /"pass"\s*:/.test(o));
  if (!raw) return { pass: false, reason: `no verdict in transcript: ${blob.slice(-160)}` };
  try { return JSON.parse(raw); } catch { return { pass: false, reason: `unparseable: ${raw.slice(0, 160)}` }; }
}

test('gallery visual-AI: each slider reads as one aligned image', { timeout: 600_000 }, async () => {
  if (!(await claudeAvailable())) { console.log('SKIP: `claude` CLI not found on PATH'); return; }
  const server = await startServer({ root: ROOT });
  const browser = await chromium.launch();
  const failures = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    await page.goto(server.url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => customElements.get('img-comparison-slider') !== undefined);
    // Force lazy imagery eager FIRST, then wait — with a per-image timeout so a
    // never-visible lazy image can't hang the run.
    await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; }));
    await page.evaluate(async () => {
      const withTimeout = i => i.complete ? Promise.resolve()
        : Promise.race([
            new Promise(r => { i.onload = i.onerror = r; }),
            new Promise(r => setTimeout(r, 4000)),
          ]);
      await Promise.all([...document.images].map(withTimeout));
    });

    for (const s of SUBJECTS) {
      await page.click(`.subj[data-subject="${s}"]`);
      await page.waitForTimeout(450);
      await page.locator('.demo-stage').scrollIntoViewIfNeeded();
      const shot = join(SHOTS, `gallery-${s}.png`);
      await page.locator('.demo-stage').screenshot({ path: shot });
      const v = await judge(shot, s);
      if (v.pass) console.log(`ok   gallery ${s}`);
      else failures.push(`${s} [${shot}]: ${v.reason || 'no reason'}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  assert.equal(failures.length, 0, `${failures.length} gallery slider(s) failed AI alignment check:\n  ` + failures.join('\n  '));
});
