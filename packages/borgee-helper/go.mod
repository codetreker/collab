// Package borgee-helper — HB stack daemon binaries (separate module from
// server-go to keep server binary slim per HB stack Go spec patch §5.5).
//
// Contains:
//   - cmd/borgee-helper — HB-2 host-bridge daemon (常驻无 sudo, IPC server)
//   - (future) cmd/install-butler — HB-1 install daemon (短命)
module borgee-helper

go 1.23
