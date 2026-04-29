// Package bpp — dead_letter_test.go: BPP-4.2 dead-letter audit log
// unit tests (3 case, 跟 acceptance §2 验收 3 项 + stance §3 守门同源).
package bpp

import (
	"bytes"
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// TestBPP4_DeadLetter_LogKeyByteIdentical — content-lock §1.③ 单源锁
// `bpp.frame_dropped_plugin_offline` 字面.
func TestBPP4_DeadLetter_LogKeyByteIdentical(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelWarn}))

	LogFrameDroppedPluginOffline(logger, DeadLetterAuditEntry{
		Actor:  "server",
		Action: "frame_drop",
		Target: "agent-x",
		When:   1700000000000,
		Scope:  "agent_config_update:cursor=42",
	})

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("log not valid JSON: %v\n%s", err, buf.String())
	}
	if entry["msg"] != "bpp.frame_dropped_plugin_offline" {
		t.Errorf("log key drift: %q (改 = 改三处单测锁: 此 test + content-lock §1.③ + LogFrameDroppedPluginOffline)",
			entry["msg"])
	}
	if entry["actor"] != "server" || entry["action"] != "frame_drop" ||
		entry["target"] != "agent-x" || entry["scope"] != "agent_config_update:cursor=42" {
		t.Errorf("audit fields missing/drift: %+v", entry)
	}
}

// TestBPP4_DeadLetter_NilLoggerNoOp — defense-in-depth.
func TestBPP4_DeadLetter_NilLoggerNoOp(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("nil logger should be no-op, got panic: %v", r)
		}
	}()
	LogFrameDroppedPluginOffline(nil, DeadLetterAuditEntry{})
}

// TestBPP4_DeadLetter_AuditSchema5FieldsByteIdentical — schema 5 字段
// (actor/action/target/when/scope) 跟 HB-1/HB-2 audit 三处同源 (改 = 改
// 三处单测锁). 用 reflect 锁字段名 + JSON tag.
func TestBPP4_DeadLetter_AuditSchema5FieldsByteIdentical(t *testing.T) {
	want := []struct {
		name string
		tag  string
	}{
		{"Actor", "actor"},
		{"Action", "action"},
		{"Target", "target"},
		{"When", "when"},
		{"Scope", "scope"},
	}
	typ := reflect.TypeOf(DeadLetterAuditEntry{})
	if typ.NumField() != len(want) {
		t.Fatalf("DeadLetterAuditEntry field count drift: got %d, want %d "+
			"(HB-1/HB-2 audit log schema 5 字段同源)", typ.NumField(), len(want))
	}
	for i, w := range want {
		f := typ.Field(i)
		if f.Name != w.name {
			t.Errorf("field[%d] name=%q, want %q", i, f.Name, w.name)
		}
		if got := f.Tag.Get("json"); got != w.tag {
			t.Errorf("field[%d] json tag=%q, want %q", i, got, w.tag)
		}
	}
}

// TestBPP4_NoRetryQueueInBPPPackage — acceptance §4.3 反约束 grep
// `pendingAcks|retryQueue|deadLetterQueue|ackTimeout.*resend|
// time.*Ticker.*resend|retry.*frame.*backoff` count==0 in
// internal/bpp/ source.
func TestBPP4_NoRetryQueueInBPPPackage(t *testing.T) {
	forbidden := []string{
		"pendingAcks",
		"retryQueue",
		"deadLetterQueue",
		"ackTimeout",
	}
	dir := "."
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	fset := token.NewFileSet()
	hits := []string{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".go") {
			continue
		}
		if strings.HasSuffix(e.Name(), "_test.go") {
			continue // tests are allowed to mention the forbidden tokens
		}
		path := filepath.Join(dir, e.Name())
		f, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
		if err != nil {
			t.Fatalf("parse %s: %v", path, err)
		}
		// AST scan identifiers (not comments) — comments may discuss the
		// forbidden tokens for documentation purposes (which is allowed
		// and required for the反约束 narrative).
		ast.Inspect(f, func(n ast.Node) bool {
			ident, ok := n.(*ast.Ident)
			if !ok {
				return true
			}
			for _, bad := range forbidden {
				if strings.Contains(ident.Name, bad) {
					hits = append(hits, path+":"+ident.Name)
				}
			}
			return true
		})
	}
	sort.Strings(hits)
	if len(hits) > 0 {
		t.Errorf("BPP-4 stance §3 反约束: forbidden retry-queue identifiers "+
			"found in internal/bpp/ source (acceptance §4.3 best-effort "+
			"立场 0 hit 守门): %v", hits)
	}
}
