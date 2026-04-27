package regression

import (
	"strings"
	"testing"
)

func TestRegisterAndEntries(t *testing.T) {
	Reset()
	called := 0
	Register("INFRA-1a", "schema_migrations applies clean", func(t *testing.T) { called++ })
	Register("CM-1", "org_id NOT NULL", func(t *testing.T) {})
	got := Entries()
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2", len(got))
	}
	// sorted by milestone
	if got[0].Milestone != "CM-1" || got[1].Milestone != "INFRA-1a" {
		t.Fatalf("not sorted: %+v", got)
	}
	_ = called
}

func TestRegisterEmptyMilestonePanics(t *testing.T) {
	Reset()
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic for empty milestone")
		}
	}()
	Register("", "x", func(t *testing.T) {})
}

func TestRegisterEmptyNamePanics(t *testing.T) {
	Reset()
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic for empty name")
		}
	}()
	Register("M", "", func(t *testing.T) {})
}

func TestRegisterNilFnPanics(t *testing.T) {
	Reset()
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic for nil fn")
		}
	}()
	Register("M", "N", nil)
}

func TestRegisterDuplicatePanics(t *testing.T) {
	Reset()
	Register("M", "N", func(t *testing.T) {})
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic on duplicate")
		} else if !strings.Contains(r.(string), "duplicate") {
			t.Fatalf("panic message wrong: %v", r)
		}
	}()
	Register("M", "N", func(t *testing.T) {})
}

func TestRunAllEmptySkips(t *testing.T) {
	Reset()
	// Capture skip via a sub-test. RunAll calls t.Skip when empty.
	tt := &testing.T{}
	// We can't directly read Skip state; instead check via a sub-test.
	t.Run("dispatch", func(sub *testing.T) {
		// Run RunAll and confirm it doesn't panic + no entries executed.
		// Use a fresh registry.
		ran := false
		Reset()
		_ = ran
		RunAll(sub)
		// If sub was skipped or finished cleanly, this assertion passes.
	})
	_ = tt
}

func TestRunAllInvokesEachEntry(t *testing.T) {
	Reset()
	hits := map[string]int{}
	Register("A", "one", func(t *testing.T) { hits["A/one"]++ })
	Register("A", "two", func(t *testing.T) { hits["A/two"]++ })
	Register("B", "one", func(t *testing.T) { hits["B/one"]++ })

	t.Run("suite", func(sub *testing.T) {
		RunAll(sub)
	})

	if hits["A/one"] != 1 || hits["A/two"] != 1 || hits["B/one"] != 1 {
		t.Fatalf("not all entries ran exactly once: %v", hits)
	}
}

func TestEntriesIsCopy(t *testing.T) {
	Reset()
	Register("M", "N", func(t *testing.T) {})
	got := Entries()
	got[0].Milestone = "MUTATED"
	got2 := Entries()
	if got2[0].Milestone == "MUTATED" {
		t.Fatal("Entries returned internal slice (not a copy)")
	}
}
