package sandbox

import "testing"

func TestHB26_PlatformLabelMatchesBuildTag(t *testing.T) {
	t.Parallel()
	switch Platform {
	case "linux", "darwin", "other":
	default:
		t.Errorf("Platform 字面 drift: got=%q (want linux|darwin|other 单一)", Platform)
	}
}

func TestHB26_ApplyNoOpV0C(t *testing.T) {
	t.Parallel()
	if err := Apply(Profile{
		ReadPaths:    []string{"/tmp/grant1"},
		AuditLogPath: "/var/log/borgee-helper/audit.log.jsonl",
		TmpCachePath: "/var/cache/borgee-helper",
	}); err != nil {
		t.Errorf("v0(C) Apply stub should be no-op nil err, got: %v", err)
	}
}
