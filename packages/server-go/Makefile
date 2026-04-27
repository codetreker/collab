.PHONY: build test test-race run clean fmt vet coverage coverage-html regression

build:
	go build -o bin/collab ./cmd/collab

test:
	go test ./... -v

test-race:
	go test ./... -v -race

run:
	go run ./cmd/collab

clean:
	rm -rf bin/

fmt:
	go fmt ./...

vet:
	go vet ./...

coverage:
	go test ./... -race -coverprofile=coverage.out
	go tool cover -func=coverage.out | tail -1

coverage-html:
	go test ./... -coverprofile=coverage.out
	go tool cover -html=coverage.out -o coverage.html

# regression — runs every test registered via internal/testutil/regression.
# Closed milestones add a blank import in regression_suite/suite_test.go so
# their 4.1 acceptance auto-rolls into this run (闸 5 of README.md).
regression:
	go test ./internal/testutil/regression_suite -run TestRegressionSuite -v
