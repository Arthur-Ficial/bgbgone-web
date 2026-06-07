import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
await p.goto('https://bgbgone.franzai.com/?v=s4', { waitUntil: 'load', timeout: 30000 });
await p.waitForFunction(() => customElements.get('img-comparison-slider') !== undefined, { timeout: 15000 });
await p.evaluate(async () => { await Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))); });
const subs = ['red-panda','corgi-puppy','woman-singer','1984-mccandless-eva','gallery-car','gallery-plane'];
for (const s of subs) {
  await p.click(`.subj[data-subject="${s}"]`);
  await p.waitForTimeout(450);
  await p.locator('.demo-stage').scrollIntoViewIfNeeded();
  await p.locator('.demo-stage').screenshot({ path: `tests/screens/sub-${s}.png` });
  console.log('shot', s);
}
await b.close();
console.log('DONE');
