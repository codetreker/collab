//go:build darwin

// Package sandbox — macOS sandbox-exec profile stub (v0(C) 接口锁; 真
// sandbox-exec profile 生成留 v0(D)). hb-2-spec.md §5.5.
package sandbox

// Apply v0(C) no-op stub.
func Apply(_ Profile) error {
	return nil
}

type Profile struct {
	ReadPaths    []string
	AuditLogPath string
	TmpCachePath string
}

const Platform = "darwin"
