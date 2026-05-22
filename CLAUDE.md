# bgbgone-web — Project Instructions

Sister repo to [bgbgone](https://github.com/Arthur-Ficial/bgbgone). The landing page lives at **https://bgbgone.franzai.com**.

## The Golden Goal

A landing page that is *also* a 189-year history of background removal, *also* the technical documentation for the bgbgone CLI, that is mobile-first, hand-authored, zero-framework, strict-public-domain-only, AI-tested on every release.

## Hard rules (mirror bgbgone)

- **No external fonts.** System stack only. No Google Fonts, no `@font-face`, no CDN fetches.
- **No CSS framework.** No Tailwind, no Bootstrap, no normalize.css. A hand-written reset in `style.css`.
- **No analytics, no cookies, no tracking pixels.**
- **Strict public domain images only.** Every image carries two independent PD grounds. Documented in `assets/sources/LICENSES.md`. No Creative Commons.
- **No competitor brand names** anywhere on the page. The cloud-AI chapter speaks about the category, not specific services.
- **One vendored library.** `img-comparison-slider` (MIT) under `vendor/`. No CDN at runtime.
- **No fallbacks.** Single code path per feature. If the primary doesn't work, fix the root cause.

## Palette — "darkroom safelight"

```
PAPER   #EFE9DD   warm light
INK     #1B1B1E   charcoal
AMBER   #F4A261   safelight (primary accent)
SEA     #2A9D8F   sea-green (secondary)
SUNSET  #E76F51   coral (signal / rare pop)
```

## The 10-image timeline

```
1826  Niépce, Le Gras                  · Ch.1 · first surviving photograph
1838  Daguerre, Boulevard du Temple    · Ch.1 · first person captured
1855  Nadar, Baudelaire                · Ch.2 · invented backdrop
1878  Muybridge, horse-in-motion       · Ch.2 · engineered isolation + multi
1903  Daniels, Wright Flyer            · Ch.2 · sky as free background
1936  Lange, Migrant Mother            · Ch.3 · manual removal
1972  Apollo 17, Blue Marble           · Ch.4 · space-as-backdrop
1984  McCandless EVA                   · Ch.4 · HERO image
1995  Hubble, Pillars of Creation      · Ch.5 · figure/ground ambiguity
2015  Curiosity rover selfie           · Ch.6 · robotic on-device
```

McCandless and Curiosity are symlinked from `../bgbgone/Tests/fixtures/`. The other eight are fetched fresh from Wikimedia / NASA with SHA-256 pins.

## Build & deploy

```bash
bash scripts/fetch-sources.sh
make build           # bumps .version, regenerates every asset from installed bgbgone
make test            # static + Playwright e2e (mobile+desktop) + Claude-Vision rubric + Lighthouse
make deploy          # wrangler pages deploy + git push
```

`scripts/build-assets.sh` pins to `${BGBGONE_REPO}/.build/release/bgbgone` (default `/Users/arthurficial/dev/bgbgone`). `make install` over there is the only prerequisite.

## Testing — TDD + e2e + visual-AI on every release

- `tests/static.test.mjs` — contract checks (no external hosts, no @font-face, no emojis, no competitor names, every `<img>` resolves locally, before/after pairs have identical dimensions).
- `tests/e2e.test.mjs` — Playwright, iPhone 14 Pro (390×844) **first**, then Desktop 1440×900. Slider drags, chapters reveal on scroll, Muybridge shows 12 horses, tab clicks update CLI line, install button copies, GitHub button opens new tab.
- `tests/visual-ai.test.mjs` — sends both screenshots to Claude Sonnet 4.6 and asserts ten rubric keys (no purple gradients, no emojis, no competitor names, hero visible above mobile fold, install visible above mobile fold, six chapters present, timeline visible on desktop, Muybridge shows 12 horses, palette matches, editorial grade).
- `tests/lighthouse.test.mjs` — mobile perf ≥ 90, a11y = 100, BP = 100, SEO ≥ 95.

CI runs all four on every push, and on every bgbgone tag via `repository_dispatch`.
