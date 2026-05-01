// dialog_test.go — REG-HB1B-005 verify 4 grant_type 字面 byte-identical.
package dialog

import (
	"bytes"
	"strings"
	"testing"
)

func TestHB1B_GrantTypes_ByteIdentical(t *testing.T) {
	want := []string{"read", "write", "exec", "network"}
	if len(GrantTypes) != 4 {
		t.Fatalf("GrantTypes len = %d, want 4", len(GrantTypes))
	}
	for i, w := range want {
		if GrantTypes[i] != w {
			t.Errorf("GrantTypes[%d] = %q, want %q", i, GrantTypes[i], w)
		}
	}
}

func TestHB1B_PromptText_Contains4GrantTypes(t *testing.T) {
	txt := PromptText()
	for _, gt := range GrantTypes {
		if !strings.Contains(txt, "grant_type="+gt) {
			t.Errorf("PromptText missing grant_type=%s", gt)
		}
	}
}

func TestHB1B_Confirm_Yes(t *testing.T) {
	in := strings.NewReader("y\n")
	var out bytes.Buffer
	ok, err := Confirm(in, &out)
	if err != nil {
		t.Fatalf("Confirm: %v", err)
	}
	if !ok {
		t.Errorf("expected ok=true for 'y'")
	}
}

func TestHB1B_Confirm_No(t *testing.T) {
	in := strings.NewReader("n\n")
	var out bytes.Buffer
	ok, _ := Confirm(in, &out)
	if ok {
		t.Errorf("expected ok=false for 'n'")
	}
}

func TestHB1B_Confirm_EmptyDefaultsNo(t *testing.T) {
	in := strings.NewReader("\n")
	var out bytes.Buffer
	ok, _ := Confirm(in, &out)
	if ok {
		t.Errorf("expected ok=false for empty (must be explicit confirm)")
	}
}
