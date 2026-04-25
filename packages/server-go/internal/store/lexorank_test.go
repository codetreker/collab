package store

import (
	"testing"
)

func TestGenerateRankBetween(t *testing.T) {
	r := GenerateRankBetween("0|aaaaaa", "0|zzzzzz")
	if r == "" {
		t.Fatal("expected non-empty rank")
	}
	if CompareLexorank(r, "0|aaaaaa") <= 0 {
		t.Fatalf("rank %q should be > 0|aaaaaa", r)
	}
	if CompareLexorank(r, "0|zzzzzz") >= 0 {
		t.Fatalf("rank %q should be < 0|zzzzzz", r)
	}
}

func TestGenerateRankBetween_EmptyBefore(t *testing.T) {
	r := GenerateRankBetween("", "0|mmmmmm")
	if r == "" {
		t.Fatal("expected non-empty rank")
	}
	if CompareLexorank(r, "0|mmmmmm") >= 0 {
		t.Fatalf("rank %q should be < 0|mmmmmm", r)
	}
}

func TestGenerateRankBetween_EmptyAfter(t *testing.T) {
	r := GenerateRankBetween("0|mmmmmm", "")
	if r == "" {
		t.Fatal("expected non-empty rank")
	}
	if CompareLexorank(r, "0|mmmmmm") <= 0 {
		t.Fatalf("rank %q should be > 0|mmmmmm", r)
	}
}

func TestRebalance(t *testing.T) {
	items := []RankItem{
		{ID: "a", Rank: "0|aaaa"},
		{ID: "b", Rank: "0|aaab"},
		{ID: "c", Rank: "0|aaac"},
	}
	results := Rebalance(items)
	if len(results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(results))
	}
	for i := 1; i < len(results); i++ {
		if CompareLexorank(results[i-1].NewRank, results[i].NewRank) >= 0 {
			t.Fatalf("rank %q should be < %q", results[i-1].NewRank, results[i].NewRank)
		}
	}
}

func TestCompareLexorank(t *testing.T) {
	if CompareLexorank("0|aaa", "0|zzz") >= 0 {
		t.Fatal("aaa should be < zzz")
	}
	if CompareLexorank("0|zzz", "0|aaa") <= 0 {
		t.Fatal("zzz should be > aaa")
	}
	if CompareLexorank("0|mmm", "0|mmm") != 0 {
		t.Fatal("equal ranks should return 0")
	}
}

func TestGenerateInitialRank(t *testing.T) {
	r := GenerateInitialRank()
	if r == "" {
		t.Fatal("expected non-empty initial rank")
	}
	if r != "0|hzzzzz" {
		t.Fatalf("expected 0|hzzzzz, got %q", r)
	}
}
