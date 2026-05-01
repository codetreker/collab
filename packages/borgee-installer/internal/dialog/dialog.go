// Package dialog — HB-1B-INSTALLER permission popup UX.
//
// Per hb-1b-installer-spec §0.2 必修-3: 4 grant_type 字面 byte-identical
// 跟 HB-3 #520 host_grants schema CHECK enum (read/write/exec/network).
// 改 = 改 server migration host_grants v=24 CHECK constraint + 此 GrantTypes
// 单源.
//
// 真 dialog 路径走 platform-native (Linux: zenity / kdialog, macOS: osascript)
// — 走 os/exec 弹窗. 单元测试走 Confirm io.Reader/Writer 注入 seam (反 GUI
// 阻塞).
package dialog

import (
	"bufio"
	"fmt"
	"io"
	"strings"
)

// GrantTypes 4-tuple SSOT byte-identical 跟 HB-3 #520 host_grants CHECK enum.
// 改 = 改 server migrations + 此 slice + REG-HB1B-005 reverse grep.
var GrantTypes = []string{
	"read",
	"write",
	"exec",
	"network",
}

// PromptText 渲染 native dialog body — 列 4 grant_type + 用户 explicit confirm.
// reverse-grep `grant_type.*read|grant_type.*write|grant_type.*exec|grant_type.*network`
// 在 dialog.go ≥4 hit (REG-HB1B-005).
func PromptText() string {
	var b strings.Builder
	b.WriteString("Borgee Helper 安装 — 权限确认\n\n")
	b.WriteString("borgee-helper daemon 将获得以下宿主能力:\n")
	for _, gt := range GrantTypes {
		switch gt {
		case "read":
			b.WriteString("  • grant_type=read    : 读用户 home + project 目录文件\n")
		case "write":
			b.WriteString("  • grant_type=write   : 写指定 sandbox 目录 (启动后 landlock 限定)\n")
		case "exec":
			b.WriteString("  • grant_type=exec    : 启动 plugin 子进程 (sandbox-exec 限定)\n")
		case "network":
			b.WriteString("  • grant_type=network : 出站 HTTPS 到 Borgee server (无入站)\n")
		}
	}
	b.WriteString("\n输入 'y' 确认安装, 任意其他键取消:\n")
	return b.String()
}

// Confirm 走 io.Reader/Writer seam — 真 installer cmd/* 走 os.Stdin/Stdout
// 包 native dialog wrapper. 单元测试走 strings.Reader 注入.
func Confirm(in io.Reader, out io.Writer) (bool, error) {
	if _, err := fmt.Fprint(out, PromptText()); err != nil {
		return false, err
	}
	scanner := bufio.NewScanner(in)
	if !scanner.Scan() {
		return false, scanner.Err()
	}
	resp := strings.TrimSpace(strings.ToLower(scanner.Text()))
	return resp == "y" || resp == "yes", nil
}
