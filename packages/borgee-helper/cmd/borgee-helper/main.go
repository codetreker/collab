//go:build linux || darwin

// Package main — borgee-helper daemon entry (HB-2 v0(C) host-bridge).
// 平台 transport: POSIX UDS via net.Listen("unix", path).
//
// hb-2-spec.md §3.1 IPC contract + §5.5 sandbox build tag + §5.6
// HB-2.0 prerequisite (CI matrix + 3 IPC unit) 已在 #605 落地.
package main

import (
	"context"
	"flag"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"borgee-helper/internal/acl"
	"borgee-helper/internal/audit"
	"borgee-helper/internal/grants"
	"borgee-helper/internal/ipc"
	"borgee-helper/internal/sandbox"
)

func main() {
	socket := flag.String("socket", "/run/borgee-helper/borgee-helper.sock", "UDS path (Linux/macOS)")
	auditLog := flag.String("audit-log", "/var/log/borgee-helper/audit.log.jsonl", "audit JSON-line path")
	flag.Parse()

	if err := run(*socket, *auditLog); err != nil {
		log.Fatalf("borgee-helper: %v", err)
	}
}

func run(socket, auditLogPath string) error {
	// Audit log writer (forward-only, JSON-line).
	logFile, err := os.OpenFile(auditLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		// v0(C) fallback to stderr if path unwritable (run as non-privileged
		// user in test/dev). Production sandbox 守 audit log 唯一可写路径.
		log.Printf("warn: audit log %q unwritable (%v); falling back to stderr", auditLogPath, err)
		logFile = os.Stderr
	}
	auditLogger := audit.New(logFile)

	// Grants consumer — v0(C) in-memory mock; HB-3 后真接 SQLite.
	gc := grants.NewMemoryConsumer()

	// ACL gate.
	gate := acl.New(gc)

	// Sandbox apply (build-tag selected; v0(C) no-op stub, real landlock
	// in v0(D) when go-landlock dep lands via HB-1 binary).
	if err := sandbox.Apply(sandbox.Profile{
		AuditLogPath: auditLogPath,
	}); err != nil {
		return err
	}
	log.Printf("borgee-helper: sandbox platform=%s applied (v0(C) stub)", sandbox.Platform)

	// UDS listener (POSIX).
	_ = os.Remove(socket) // best-effort cleanup stale socket
	ln, err := net.Listen("unix", socket)
	if err != nil {
		return err
	}
	defer ln.Close()
	log.Printf("borgee-helper: listening on %s", socket)

	// Signal handler for clean shutdown.
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	go func() {
		<-ctx.Done()
		_ = ln.Close()
	}()

	h := ipc.New(gate, auditLogger)
	for {
		conn, err := ln.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				return nil
			default:
			}
			log.Printf("accept err: %v", err)
			continue
		}
		go func(c net.Conn) {
			if err := h.Serve(ctx, c); err != nil {
				log.Printf("serve err: %v", err)
			}
		}(conn)
	}
}
