// Package deploy — HB-1B-INSTALLER per-platform service unit deploy.
//
// Per hb-1b-installer-spec §0.2 #2:
//   - Linux: systemd unit (跟 borgee-helper.service byte-identical 承袭)
//     via `sudo apt install` / `systemctl enable`.
//   - macOS: launchd unit (跟 borgee-helper.plist byte-identical 承袭) via
//     `sudo /usr/sbin/installer` + `launchctl load`.
//
// Test seam: Step 描述返回 string slice — 单元测试走 plan inspection 反真
// sudo 调 (反 CI hang). 真 installer cmd/* 走 os/exec.CommandContext.
package deploy

import (
	"fmt"
	"runtime"
)

// Plan 返回 per-platform deploy steps as string slice — testable plan
// inspection (真 cmd/* 走 os/exec). 反向 grep `sudo|installer|launchctl|systemctl`
// in cmd/* main.go ≥3 hit per platform (REG-HB1B-004).
type Plan struct {
	Platform string
	Steps    []string
}

// LinuxPlan 返回 Linux .deb / systemd 部署步骤. 走 sudo apt install +
// systemd unit (跟 borgee-helper.service byte-identical 承袭).
func LinuxPlan(debPath string) *Plan {
	return &Plan{
		Platform: "linux",
		Steps: []string{
			fmt.Sprintf("sudo apt install %s", debPath),
			"sudo systemctl daemon-reload",
			"sudo systemctl enable borgee-helper.service",
			"sudo systemctl start borgee-helper.service",
		},
	}
}

// DarwinPlan 返回 macOS .pkg / launchd 部署步骤. 走 sudo /usr/sbin/installer
// + launchctl (跟 borgee-helper.plist byte-identical 承袭).
func DarwinPlan(pkgPath string) *Plan {
	return &Plan{
		Platform: "darwin",
		Steps: []string{
			fmt.Sprintf("sudo /usr/sbin/installer -pkg %s -target /", pkgPath),
			"sudo launchctl load /Library/LaunchDaemons/cloud.borgee.host-bridge.plist",
		},
	}
}

// PlanForCurrentOS 返回当前 runtime.GOOS 对应的 plan, 反 cross-platform
// 误投递 (反 windows .msi 留 v2 透明).
func PlanForCurrentOS(installerArtifact string) (*Plan, error) {
	switch runtime.GOOS {
	case "linux":
		return LinuxPlan(installerArtifact), nil
	case "darwin":
		return DarwinPlan(installerArtifact), nil
	default:
		return nil, fmt.Errorf("hb-1b-installer: GOOS=%s not supported in v1 (windows留 v2)", runtime.GOOS)
	}
}
