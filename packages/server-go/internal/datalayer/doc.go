// Package datalayer — DL-1 §0 立场 ① "4 interface byte-identical 跟蓝图 §4 B 表"
// (Storage / Presence / EventBus / Repository).
//
// v1 立场: interface only. 4 interface 全用既有实现 (SQLite gorm + in-memory
// map + DB blob + in-process map), 仅加 interface seam 锁未来换实现路径.
// 不真切实现 — 反 over-engineer.
//
// Reference: `docs/implementation/modules/dl-1-spec.md` v0 (飞马 90 行).
package datalayer
