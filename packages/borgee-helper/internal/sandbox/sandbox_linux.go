//go:build linux

// Package sandbox — Linux landlock-based sandbox stub (v0(C) 接口锁; 真
// landlock+AppArmor 调用留 v0(D) — landlock-lsm/go-landlock dep 待 HB-1
// Go binary 引入后共享). hb-2-spec.md §5.5 sandbox build tag 拆死.
package sandbox

// Apply 应用 sandbox profile (Linux: landlock LSM 限制 host-bridge daemon
// 只能 read 授权 grant scope 内的路径, 反向断写路径 0). v0(C) 是 no-op
// stub — 单测验证 build tag 选对; 真 landlock 调用留 v0(D).
func Apply(_ Profile) error {
	return nil
}

// Profile 描述允许 read 的路径白名单 + audit log 写路径 + 临时缓存路径.
type Profile struct {
	ReadPaths      []string // grants 注入
	AuditLogPath   string   // 唯一允许写的路径
	TmpCachePath   string   // 允许写的临时缓存
}

// Platform 锚 — 单测断 build tag 选对.
const Platform = "linux"
