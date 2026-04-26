package config

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port          int
	Host          string
	LogLevelStr   string
	NodeEnv       string
	CORSOrigin    string
	DatabasePath  string
	UploadDir     string
	WorkspaceDir  string
	ClientDist    string
	JWTSecret     string
	DevAuthBypass bool
	AdminEmail    string
	AdminPassword string
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:         envInt("PORT", 4900),
		Host:         envStr("HOST", "0.0.0.0"),
		LogLevelStr:  envStr("LOG_LEVEL", "info"),
		NodeEnv:      envStr("NODE_ENV", ""),
		CORSOrigin:   envStr("CORS_ORIGIN", "https://borgee.codetrek.cn"),
		DatabasePath: envStr("DATABASE_PATH", "data/collab.db"),
		UploadDir:    envStr("UPLOAD_DIR", "data/uploads"),
		WorkspaceDir: envStr("WORKSPACE_DIR", "data/workspaces"),
		ClientDist:   envStr("CLIENT_DIST", "packages/client/dist"),
		JWTSecret:    envStr("JWT_SECRET", ""),
		DevAuthBypass: envBool("DEV_AUTH_BYPASS", false),
		AdminEmail:    envStr("ADMIN_EMAIL", ""),
		AdminPassword: envStr("ADMIN_PASSWORD", ""),
	}

	if cfg.JWTSecret == "" && cfg.IsDevelopment() {
		cfg.JWTSecret = "dev-secret"
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

func (c *Config) IsDevelopment() bool {
	return c.NodeEnv == "development"
}

func (c *Config) Validate() error {
	if !c.IsDevelopment() && c.JWTSecret == "" {
		return fmt.Errorf("JWT_SECRET is required in production")
	}
	return nil
}

func (c *Config) LogLevel() slog.Level {
	switch strings.ToLower(c.LogLevelStr) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func envStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return def
}

func envBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return def
}
