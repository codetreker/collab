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
