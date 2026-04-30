// Package bpp_test — schema_equivalence_test.go: BPP-1 (#274/#280)
// envelope ↔ RT-0 (#237) byte-identical equivalence pin.
//
// The spec brief §1 invariant ① says "9 帧 envelope 与 RT-0 #237
// envelope byte-identical 5 字段 (type/op/ts/v/payload, 序无关 schema
// 锁)". The intent is that the envelope dispatcher contract — `Type` is
// field 0, tagged `json:"type"`, kind string — is identical across
// RT-0 (`AgentInvitationPendingFrame`), RT-1.1 (`ArtifactUpdatedFrame`)
// and every BPP-1 envelope. This test reflects across all three sets
// and asserts the dispatcher prefix is byte-identical.
//
// Note: the brief's verbatim "5 字段 type/op/ts/v/payload" predates the
// final RT-0 lock landed in PR #237, which collapsed the envelope to
// a single discriminator + payload-as-fields shape (no separate
// `payload` wrapper). The pin therefore enforces the actually-shipped
// shape: field 0 is the discriminator, payload is the rest. Drift
// between BPP-1 and RT-0 on this contract is a CI red regardless.

package bpp_test

import (
	"reflect"
	"testing"

	"borgee-server/internal/bpp"
	"borgee-server/internal/ws"
)

// dispatcherPrefix is the byte-identical bit every envelope shares:
// field 0 must be `Type string `json:"type"“. We extract a small
// fingerprint and assert RT-0, RT-1.1 and every BPP-1 envelope match.
type dispatcherPrefix struct {
	FieldName string
	JSONTag   string
	Kind      reflect.Kind
}

func extractPrefix(v any) dispatcherPrefix {
	t := reflect.TypeOf(v)
	f0 := t.Field(0)
	return dispatcherPrefix{
		FieldName: f0.Name,
		JSONTag:   f0.Tag.Get("json"),
		Kind:      f0.Type.Kind(),
	}
}

func TestBPPEnvelopeMatchesRT0Dispatcher(t *testing.T) {
	t.Parallel()
	rt0 := extractPrefix(ws.AgentInvitationPendingFrame{})
	rt0Decided := extractPrefix(ws.AgentInvitationDecidedFrame{})
	rt11 := extractPrefix(ws.ArtifactUpdatedFrame{})

	if rt0 != rt0Decided {
		t.Fatalf("RT-0 self-consistency broken: pending=%+v decided=%+v", rt0, rt0Decided)
	}
	if rt0 != rt11 {
		t.Fatalf("RT-0 ↔ RT-1.1 dispatcher drift: rt0=%+v rt11=%+v", rt0, rt11)
	}
	want := rt0
	if want.FieldName != "Type" || want.JSONTag != "type" || want.Kind != reflect.String {
		t.Fatalf("RT-0 envelope template lost its dispatcher contract: %+v", want)
	}

	for _, e := range bpp.AllBPPEnvelopes() {
		got := extractPrefix(e)
		if got != want {
			t.Errorf("BPP-1 envelope %T dispatcher drift: got %+v, want %+v (RT-0 #237 lock)", e, got, want)
		}
	}
}

// TestBPPEnvelopeAlsoMatchesRT13Resume covers the RT-1.3 #293 resume
// frames (SessionResumeRequest / SessionResumeAck) which already live
// in package bpp. These are NOT in AllBPPEnvelopes() — they're an
// agent-runtime handshake, not a BPP-1 control/data envelope — but the
// dispatcher contract still applies, so we pin them here too.
func TestBPPEnvelopeAlsoMatchesRT13Resume(t *testing.T) {
	t.Parallel()
	want := extractPrefix(ws.AgentInvitationPendingFrame{})
	for _, v := range []any{
		bpp.SessionResumeRequest{},
		bpp.SessionResumeAck{},
	} {
		got := extractPrefix(v)
		if got != want {
			t.Errorf("RT-1.3 frame %T dispatcher drift: got %+v, want %+v", v, got, want)
		}
	}
}
