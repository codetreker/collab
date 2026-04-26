package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"
)

type funcCoverage struct {
	Location string
	Name     string
	Percent  float64
	Critical bool
}

var criticalPathMarkers = []string{
	"internal/api/",
	"internal/auth/",
	"internal/server/",
	"internal/store/",
}

func main() {
	threshold := flag.Float64("threshold", 80, "coverage threshold for critical path functions")
	inputPath := flag.String("input", "", "go cover -func output file (defaults to stdin)")
	flag.Parse()

	r, closeFn, err := inputReader(*inputPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "coverage: %v\n", err)
		os.Exit(2)
	}
	defer closeFn()

	funcs, total, err := parseCoverFunc(r)
	if err != nil {
		fmt.Fprintf(os.Stderr, "coverage: %v\n", err)
		os.Exit(2)
	}

	var below []funcCoverage
	for _, f := range funcs {
		if f.Critical && f.Percent < *threshold {
			below = append(below, f)
		}
	}
	sort.Slice(below, func(i, j int) bool {
		if below[i].Percent == below[j].Percent {
			return below[i].Name < below[j].Name
		}
		return below[i].Percent < below[j].Percent
	})

	fmt.Printf("Coverage report\n")
	fmt.Printf("Total: %.1f%%\n", total)
	fmt.Printf("Critical threshold: %.1f%%\n", *threshold)
	fmt.Println()

	if len(below) == 0 {
		fmt.Println("No critical path functions below threshold.")
		return
	}

	fmt.Println("Critical path functions below threshold:")
	fmt.Printf("%-8s %-48s %s\n", "COVER", "FUNCTION", "LOCATION")
	for _, f := range below {
		fmt.Printf("%6.1f%% %-48s %s\n", f.Percent, f.Name, f.Location)
	}
	os.Exit(1)
}

func inputReader(path string) (io.Reader, func(), error) {
	if path == "" || path == "-" {
		return os.Stdin, func() {}, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, func() {}, err
	}
	return f, func() { _ = f.Close() }, nil
}

func parseCoverFunc(r io.Reader) ([]funcCoverage, float64, error) {
	scanner := bufio.NewScanner(r)
	var funcs []funcCoverage
	var total float64
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		pct, ok := parsePercent(fields[len(fields)-1])
		if !ok {
			continue
		}
		if fields[0] == "total:" {
			total = pct
			continue
		}

		name := fields[len(fields)-2]
		location := fields[0]
		fn := funcCoverage{Location: location, Name: name, Percent: pct}
		fn.Critical = isCritical(location, name)
		funcs = append(funcs, fn)
	}
	if err := scanner.Err(); err != nil {
		return nil, 0, err
	}
	return funcs, total, nil
}

func parsePercent(raw string) (float64, bool) {
	trimmed := strings.TrimSuffix(raw, "%")
	v, err := strconv.ParseFloat(trimmed, 64)
	return v, err == nil
}

func isCritical(location, name string) bool {
	combined := location + " " + name
	for _, marker := range criticalPathMarkers {
		if strings.Contains(combined, marker) {
			return true
		}
	}
	return false
}
