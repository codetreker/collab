# HB-1B-INSTALLER install assets

> hb-1b-installer-spec §0.2: per-platform install assets are reused **byte-identical** from
> `packages/borgee-helper/install/` (HB-2 v0(D) #617). The installer (`cmd/borgee-installer-{linux,darwin}`)
> deploys these unit files; this README enumerates the contract so reverse-grep守门 finds
> them on the canonical path.
>
> **0 server-go diff + 0 borgee-helper diff** (反约束 hb-1b-installer-spec §0.2 #3) — the
> installer **invokes** `sudo apt install` / `sudo /usr/sbin/installer` which install the
> existing `.service` / `.plist` from the borgee-helper module. We do **not** duplicate
> their bytes here.

## Linux: systemd unit

Path inside .deb: `/lib/systemd/system/borgee-helper.service`.
Source-of-truth: `packages/borgee-helper/install/borgee-helper.service` (HB-2 v0(D) #617).
Installer step: `sudo systemctl enable borgee-helper.service` (see `internal/deploy/deploy.go::LinuxPlan`).

## macOS: launchd plist

Path inside .pkg: `/Library/LaunchDaemons/cloud.borgee.host-bridge.plist`.
Source-of-truth: `packages/borgee-helper/install/cloud.borgee.host-bridge.plist` (HB-2 v0(D) #617).
Installer step: `sudo launchctl load /Library/LaunchDaemons/cloud.borgee.host-bridge.plist`
(see `internal/deploy/deploy.go::DarwinPlan`).

## Windows: 留 v2

Per user dispatch hint: "Linux .deb + macOS .pkg, Windows v2 留账". Windows MSI + Windows
Service registration deferred. Reverse grep `borgee-installer-windows` returns 0 hit in v1.
