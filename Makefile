.PHONY: registry-totals

registry-totals:
	@echo "Total: $$(grep -cE '^- REG-' docs/qa/regression-registry.md)"
	@echo "Active: $$(grep -cE '^- REG-.*🟢' docs/qa/regression-registry.md)"
	@echo "Pending: $$(grep -cE '^- REG-.*⚪' docs/qa/regression-registry.md)"
