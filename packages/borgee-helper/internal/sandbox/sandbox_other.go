//go:build !linux && !darwin

// Package sandbox — fallback (Windows / 其他). hb-2-spec.md §5.5 v1 不挂,
// no-op + 警告日志 (production 真 daemon 启动时 main 检查 Platform 字面
// 决定是否 abort).
package sandbox

// Apply 返回 nil (no-op); main.go 检 Platform!="linux"&&Platform!="darwin"
// 时打 warn 日志.
func Apply(_ Profile) error {
	return nil
}

type Profile struct {
	ReadPaths    []string
	AuditLogPath string
	TmpCachePath string
}

const Platform = "other"
