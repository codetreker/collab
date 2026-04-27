// Command migrate runs Borgee's forward-only schema migrations.
//
// Usage:
//
//	borgee-migrate up                # apply all pending migrations
//	borgee-migrate up --target 5     # apply pending migrations up to version 5
//	borgee-migrate status            # list applied vs pending
//
// The same engine runs automatically on server startup (cmd/collab); this CLI
// exists for ops / CI verification (G0.1 acceptance).
package main

import (
	"flag"
	"fmt"
	"os"

	"borgee-server/internal/config"
	"borgee-server/internal/migrations"
	"borgee-server/internal/store"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	cmd := os.Args[1]

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "config error: %v\n", err)
		os.Exit(1)
	}
	s, err := store.Open(cfg.DatabasePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "store.Open: %v\n", err)
		os.Exit(1)
	}
	defer s.Close()

	// Run legacy createSchema first so v0 baseline tables (users, channels, ...)
	// exist before forward-only migrations that reference them. cmd/collab does
	// the same on startup; CLI must mirror that order or `up` on a fresh DB
	// fails with "no such table: users" when CM-1.1+ migrations touch legacy
	// tables. Tracked in v0 audit — when createSchema is decomposed into the
	// migration registry (Phase 1+), this call goes away.
	if err := s.Migrate(); err != nil {
		fmt.Fprintf(os.Stderr, "store.Migrate (legacy baseline): %v\n", err)
		os.Exit(1)
	}

	engine := migrations.Default(s.DB())

	switch cmd {
	case "up":
		fs := flag.NewFlagSet("up", flag.ExitOnError)
		target := fs.Int("target", 0, "apply migrations up to this version (0 = all pending)")
		_ = fs.Parse(os.Args[2:])
		if err := engine.Run(*target); err != nil {
			fmt.Fprintf(os.Stderr, "migrate up: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("ok")
	case "status":
		applied, err := engine.Applied()
		if err != nil {
			fmt.Fprintf(os.Stderr, "status: %v\n", err)
			os.Exit(1)
		}
		pending, err := engine.Pending()
		if err != nil {
			fmt.Fprintf(os.Stderr, "status: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("applied: %d  pending: %d\n", len(applied), len(pending))
		for _, m := range pending {
			fmt.Printf("  pending v%d  %s\n", m.Version, m.Name)
		}
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: borgee-migrate <up|status> [--target N]")
}
