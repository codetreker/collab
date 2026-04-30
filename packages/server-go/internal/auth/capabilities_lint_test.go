// AP-4-enum.1 reflect-lint tests — capability ALL slice + init() rebuild
// Capabilities map + IsValidCapability helper 单源 (spec §0 立场 ① + ③).
//
// 6 unit (跟 acceptance template 立场 ① 1.1-1.5 + 立场 ③ 3.1 同源):
//   - TestAP4E1_ALL_OrderedByteIdentical (1.1) — ALL 顺序跟 const 声明顺序对齐
//   - TestAP4E1_Capabilities_AutoBuildFromAll (1.2) — init() 派生 map ↔ ALL 双向
//   - TestAP4E1_ALL_Length14 (1.3) — len(ALL) == 14 锁
//   - TestAP4E1_reflect_lint_NoOrphanConst (1.4a) — 14 const 字面 ⊂ ALL
//   - TestAP4E1_reflect_lint_NoExtraInMap (1.4b) — Capabilities map ⊂ ALL
//   - TestAP4E1_NoAdminGodModeInALL (1.5) — admin god-mode 红线 (ADM-0 §1.3)
//   - TestAP4E1_IsValidCapability_TruthTable (3.1) — 14 true + 1 false
package auth

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strings"
	"testing"
)

// TestAP4E1_ALL_OrderedByteIdentical — ALL slice 顺序 byte-identical 跟
// const 声明顺序 (channel scope → artifact scope → messaging → channel admin).
func TestAP4E1_ALL_OrderedByteIdentical(t *testing.T) {
	want := []string{
		"read_channel", "write_channel", "delete_channel",
		"read_artifact", "write_artifact", "commit_artifact", "iterate_artifact", "rollback_artifact",
		"mention_user", "read_dm", "send_dm",
		"manage_members", "invite_user", "change_role",
	}
	if len(ALL) != len(want) {
		t.Fatalf("ALL len = %d, want %d", len(ALL), len(want))
	}
	for i, c := range ALL {
		if c != want[i] {
			t.Errorf("ALL[%d] = %q, want %q (顺序漂)", i, c, want[i])
		}
	}
}

// TestAP4E1_Capabilities_AutoBuildFromAll — init() 派生 map 双向 ⊂ ALL.
func TestAP4E1_Capabilities_AutoBuildFromAll(t *testing.T) {
	if len(Capabilities) != len(ALL) {
		t.Fatalf("Capabilities len = %d, want %d", len(Capabilities), len(ALL))
	}
	for _, c := range ALL {
		if !Capabilities[c] {
			t.Errorf("Capabilities[%q] missing — init() 漏建", c)
		}
	}
	for k, v := range Capabilities {
		if !v {
			t.Errorf("Capabilities[%q] = false — init() 应全 true", k)
		}
		found := false
		for _, c := range ALL {
			if c == k {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Capabilities[%q] not in ALL — drift", k)
		}
	}
}

// TestAP4E1_ALL_Length14 — 14 锁 (跟 AP-1 #493 同源).
func TestAP4E1_ALL_Length14(t *testing.T) {
	if len(ALL) != 14 {
		t.Fatalf("len(ALL) = %d, want 14 (AP-1 #493 字面锁)", len(ALL))
	}
}

// TestAP4E1_reflect_lint_NoOrphanConst — capabilities.go const 字面 ⊂ ALL.
// 走 go/ast 解析 capabilities.go const block, 验每个 string literal ∈ ALL.
func TestAP4E1_reflect_lint_NoOrphanConst(t *testing.T) {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, "capabilities.go", nil, parser.ParseComments)
	if err != nil {
		t.Fatalf("parse capabilities.go: %v", err)
	}
	allSet := make(map[string]bool, len(ALL))
	for _, c := range ALL {
		allSet[c] = true
	}
	for _, decl := range f.Decls {
		gd, ok := decl.(*ast.GenDecl)
		if !ok || gd.Tok != token.CONST {
			continue
		}
		for _, spec := range gd.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok {
				continue
			}
			for _, val := range vs.Values {
				bl, ok := val.(*ast.BasicLit)
				if !ok || bl.Kind != token.STRING {
					continue
				}
				lit := strings.Trim(bl.Value, `"`)
				if !allSet[lit] {
					t.Errorf("const literal %q not in ALL — orphan const drift", lit)
				}
			}
		}
	}
}

// TestAP4E1_reflect_lint_NoExtraInMap — Capabilities map ⊂ ALL (无 extra).
func TestAP4E1_reflect_lint_NoExtraInMap(t *testing.T) {
	allSet := make(map[string]bool, len(ALL))
	for _, c := range ALL {
		allSet[c] = true
	}
	for k := range Capabilities {
		if !allSet[k] {
			t.Errorf("Capabilities[%q] not in ALL — extra drift", k)
		}
	}
}

// TestAP4E1_NoAdminGodModeInALL — ADM-0 §1.3 红线 (admin 永久不挂).
func TestAP4E1_NoAdminGodModeInALL(t *testing.T) {
	banned := []string{"admin_", "godmode_", "impersonat"}
	for _, c := range ALL {
		for _, b := range banned {
			if strings.Contains(c, b) {
				t.Errorf("ALL contains banned god-mode pattern: %q ~ %q (ADM-0 §1.3 红线)", c, b)
			}
		}
	}
}

// TestAP4E1_IsValidCapability_TruthTable — 14 true + 1 false.
func TestAP4E1_IsValidCapability_TruthTable(t *testing.T) {
	for _, c := range ALL {
		if !IsValidCapability(c) {
			t.Errorf("IsValidCapability(%q) = false, want true", c)
		}
	}
	bogus := []string{"", "admin_god", "read_channel ", "READ_CHANNEL", "no_such_perm"}
	for _, b := range bogus {
		if IsValidCapability(b) {
			t.Errorf("IsValidCapability(%q) = true, want false", b)
		}
	}
}
