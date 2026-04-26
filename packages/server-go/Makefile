.PHONY: build test test-race run clean fmt vet

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
