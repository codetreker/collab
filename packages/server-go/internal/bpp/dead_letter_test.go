// Package bpp — dead_letter_test.go: BPP-4.2 dead-letter audit log
// unit tests (3 case, 跟 acceptance §2 验收 3 项 + stance §3 守门同源).
package bpp

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"reflect"
	"testing"

	"borgee-server/internal/lint/astscan"
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
//
// PERF-AST-LINT: refactored from inline ast.Walk to reusable
// astscan.AssertNoForbiddenIdentifiers helper (飞马 spec, 2026-04-29).
// 字面承袭 byte-identical: 4 forbidden id 跟 BPP-4 #499 原 inline scan
// 同源 (BPP-5+/HB-3+ 后续 milestone reuse 同 helper).
func TestBPP4_NoRetryQueueInBPPPackage(t *testing.T) {
	astscan.AssertNoForbiddenIdentifiers(t, ".", []astscan.ForbiddenIdentifier{
		{Name: "pendingAcks", Reason: "BPP-4 ack best-effort 不重发 (acceptance §4.3)"},
		{Name: "retryQueue", Reason: "BPP-4 ack best-effort 不重发 (acceptance §4.3)"},
		{Name: "deadLetterQueue", Reason: "BPP-4 audit log 不持久 (stance §3)"},
		{Name: "ackTimeout", Reason: "BPP-4 30s 字面单源在 const, 不在 production identifier"},
	}, astscan.ScanOpts{})
}
