.PHONY: help fetch build test test-static test-mobile test-visual test-lh serve deploy bump install-deps

VERSION := $(shell cat .version)
BGBGONE_REPO ?= /Users/arthurficial/dev/bgbgone

help:
	@echo "bgbgone-web $(VERSION)"
	@echo ""
	@echo "Targets:"
	@echo "  fetch          download 8 new PD source images + verify SHA-256"
	@echo "  build          bump version + regenerate every asset via bgbgone"
	@echo "  test           static + mobile + visual-AI + lighthouse"
	@echo "  test-static    contract checks (no external hosts etc.)"
	@echo "  test-mobile    Playwright overflow + axe color-contrast"
	@echo "  test-visual    Claude rubric per-section (requires ANTHROPIC_API_KEY)"
	@echo "  test-lh        Lighthouse mobile gates"
	@echo "  serve          local static server (gzip + brotli, prints url)"
	@echo "  deploy         wrangler pages deploy + git push"
	@echo "  install-deps   npm install + playwright install"

install-deps:
	npm install
	npx playwright install --with-deps chromium

fetch:
	bash scripts/fetch-sources.sh

bump:
	@old=$$(cat .version); \
	IFS=. read -r maj min pat <<<"$$old"; \
	new="$$maj.$$min.$$((pat+1))"; \
	echo "$$new" > .version; \
	echo "version: $$old -> $$new"

build: bump fetch
	bash scripts/build-assets.sh
	bash scripts/verify-pairs.sh
	bash scripts/snapshot-help.sh

test: test-static test-mobile test-lh test-visual
	@echo ""
	@echo "all gates green — bgbgone-web $(VERSION)"

test-static:
	node tests/static.test.mjs

test-mobile:
	node --test tests/mobile.test.mjs

test-visual:
	node --test tests/visual-ai.test.mjs

test-lh:
	node --test tests/lighthouse.test.mjs

serve:
	node -e "import('./tests/_serve.mjs').then(async m => { const s = await m.startServer({ root: '.', port: 8787 }); console.log('serving on', s.url); })"

deploy:
	bash scripts/deploy.sh
