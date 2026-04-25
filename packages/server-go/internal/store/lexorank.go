package store

import (
	"strings"
)

type RankItem struct {
	ID   string
	Rank string
}

type RankResult struct {
	ID      string
	NewRank string
}

func GenerateInitialRank() string {
	return "0|hzzzzz"
}

func GenerateRankBetween(before, after string) string {
	var rankA, rankB string
	if before != "" {
		_, rankA = splitRank(before)
	}
	if after != "" {
		_, rankB = splitRank(after)
	}
	return "0|" + midpoint(rankA, rankB)
}

func Rebalance(items []RankItem) []RankResult {
	n := len(items)
	if n == 0 {
		return nil
	}

	const rankLength = 6
	results := make([]RankResult, n)
	for i, item := range items {
		fraction := float64(i+1) / float64(n+1)
		rankChars := make([]byte, rankLength)
		frac := fraction
		for d := 0; d < rankLength; d++ {
			frac *= 26
			digit := int(frac)
			rankChars[d] = byte('a' + digit)
			frac -= float64(digit)
		}
		results[i] = RankResult{ID: item.ID, NewRank: "0|" + string(rankChars)}
	}
	return results
}

func CompareLexorank(a, b string) int {
	if a < b {
		return -1
	}
	if a > b {
		return 1
	}
	return 0
}

func midpoint(a, b string) string {
	// Normalise to equal length (at least 1)
	maxLen := len(a)
	if len(b) > maxLen {
		maxLen = len(b)
	}
	if maxLen == 0 {
		maxLen = 1
	}

	// a empty → minimum, b empty → maximum (matching TS semantics)
	var aa string
	if a != "" {
		aa = padRight(a, maxLen)
	} else {
		aa = strings.Repeat("a", maxLen)
	}

	aDigits := make([]int, maxLen)
	for i := 0; i < maxLen; i++ {
		aDigits[i] = int(aa[i] - 'a')
	}

	bDigits := make([]int, maxLen)
	if b != "" {
		bb := padRight(b, maxLen)
		for i := 0; i < maxLen; i++ {
			bDigits[i] = int(bb[i] - 'a')
		}
	} else {
		for i := 0; i < maxLen; i++ {
			bDigits[i] = 25 // 'z' = max
		}
	}

	// Sum digits (base-26)
	sum := make([]int, maxLen)
	carry := 0
	for i := maxLen - 1; i >= 0; i-- {
		s := aDigits[i] + bDigits[i] + carry
		sum[i] = s % 26
		carry = s / 26
	}

	// Divide by 2 to get midpoint, propagating carry from sum
	remainder := carry
	mid := make([]byte, maxLen)
	for i := 0; i < maxLen; i++ {
		cur := remainder*26 + sum[i]
		mid[i] = byte('a' + cur/2)
		remainder = cur % 2
	}

	// Extra precision digit if remainder
	if remainder > 0 {
		mid = append(mid, byte('a'+13)) // 'm'
	}

	result := strings.TrimRight(string(mid), "a")
	if result == "" {
		result = "a"
	}

	// Safety: if result equals either input, extend
	if result == aa || (b != "" && result == padRight(b, maxLen)) {
		result += string(byte('a' + 13))
	}

	return result
}

func splitRank(rank string) (string, string) {
	parts := strings.SplitN(rank, "|", 2)
	if len(parts) != 2 {
		return "0", rank
	}
	return parts[0], parts[1]
}

func padRight(s string, length int) string {
	for len(s) < length {
		s += "a"
	}
	return s
}
