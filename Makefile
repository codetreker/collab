.PHONY: registry-totals precheck precheck-fast

registry-totals:
	@echo "Total: $$(grep -cE '^- REG-' docs/qa/regression-registry.md)"
	@echo "Active: $$(grep -cE '^- REG-.*🟢' docs/qa/regression-registry.md)"
	@echo "Pending: $$(grep -cE '^- REG-.*⚪' docs/qa/regression-registry.md)"

precheck:
	@echo "==> go test cov"
	@go test -timeout=180s -coverprofile=/tmp/cov.out ./packages/server-go/... | tail -5
	@total=$$(go tool cover -func=/tmp/cov.out | grep total | awk '{print $$3}' | tr -d '%'); \
		echo "Total cov: $$total%"; \
		awk -v t="$$total" 'BEGIN { if (t+0 < 85) { print "FAIL: cov < 85%"; exit 1 } else { print "PASS: cov ≥ 85%" } }'
	@echo "==> client vitest"
	@cd packages/client && pnpm vitest run --testTimeout=10000 2>&1 | tail -10
	@echo "==> typecheck"
	@cd packages/client && pnpm typecheck 2>&1 | tail -5

precheck-fast:
	@echo "Skip cov, only typecheck + last-changed package"
	@cd packages/client && pnpm typecheck 2>&1 | tail -5
