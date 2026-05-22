# bgbgone-web

Landing page for [bgbgone](https://github.com/Arthur-Ficial/bgbgone) at **https://bgbgone.franzai.com**.

> background, be gone.

A hand-authored, mobile-first, zero-framework, single-column page that:

- is the landing page for the bgbgone CLI;
- demonstrates bgbgone with a four-card colour gallery — car, airplane, portrait, animal — every image strict public domain or CC0, every cut centred;
- exposes a per-card algorithm `<select>` so the visitor can swap between `--algo auto / person / saliency` and see the real `.<algo>.cut.png` (no faked previews);
- documents the full CLI.

## Stack

- Single `index.html`, hand-authored `style.css`, vanilla `app.js`. No framework, no page build step.
- System fonts only. No external font / CDN hosts.
- One vendored MIT library: `img-comparison-slider` (~5 KB).
- Strict-PD / CC0 sources from Wikimedia (NASA / USAF / NPS / Tom Coates CC0), SHA-256 pinned in `assets/sources/CHECKSUMS.sha256`.
- Every source is rendered with all three bgbgone algorithms — the `<select>` swaps in the real `.<algo>.cut.png` at runtime. No fallbacks: when a combo produces no honest cut it's recorded in `assets/pairs/manifest.json` and the picker UI says so.
- Cut-quality audit script: `bash scripts/audit-cuts.sh` walks every visible `.cut.png` and runs the `claude` CLI (subscription auth) with a GOOD/BAD rubric; the result lands in `assets/pairs/audit.json`.
- Hosted on Cloudflare Pages (project `bgbgone-web`).

## Build & test

```bash
bash scripts/fetch-sources.sh         # 11 PD images + checksum verify
make build                            # render every (slug × algo) via installed bgbgone
make serve                            # local static server (gzip + brotli)
make test                             # static + mobile + lighthouse + visual-AI
make deploy                           # wrangler pages deploy + git push
```

## Tests

| target          | what it gates                                                                  |
| --------------- | ------------------------------------------------------------------------------ |
| `test-static`   | no external hosts, no @font-face, no emoji, no competitor names, every `<img>` resolves locally, every (slug × algo) pair has matching dimensions, SSOT palette, manifest parses |
| `test-mobile`   | Playwright at iPhone 14 Pro + 1440×900 desktop: per-element overflow lint; axe-core WCAG-AA color-contrast sweep |
| `test-lh`       | Lighthouse mobile gates (perf ≥ 0.75, a11y = 1.00, BP ≥ 0.95, SEO ≥ 0.95)      |
| `test-visual`   | per-section Claude Sonnet 4.6 rubric on screenshots (requires `ANTHROPIC_API_KEY`) |

CI runs every gate on push, pull request, and on the `repository_dispatch` event fired by bgbgone release tags. See `.github/workflows/ci.yml`.

## License

MIT. Image assets are strict public domain (PD-USGov / PD-old / PD-NASA / PD-USFWS); see `assets/sources/LICENSES.md`.
