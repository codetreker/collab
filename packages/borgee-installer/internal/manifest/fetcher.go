// Package manifest — HB-1B-INSTALLER manifest fetcher + ed25519 verify.
//
// Contract: GET HB-1 server endpoint `/api/v1/plugin-manifest` (server-side
// PluginManifestEntries const slice, hb_1_plugin_manifest.go SSOT) + 真
// ed25519 detached signature 验签 (反 v0(C) skip).
//
// 7-reason 字典 byte-identical 跟 server-side HB1AllReasons 同源 (跨层
// 字面拆死 — 改 = 改 server hb_1_plugin_manifest.go + 此 fetcher.go +
// installer/cmd/* 三处). Drift 守门见 manifest_test.go 反向 grep.
//
// 反约束: ed25519.Verify 必真, 反 silent skip; bad sig → ReasonManifestSignatureInvalid.
package manifest

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// 7-reason 字典 byte-identical 跟 server-side HB1AllReasons (hb_1_plugin_manifest.go).
// 跨层 drift 守门: 此 7 字面 + server 7 字面 + REG-HB1B-002 reverse grep test.
const (
	ReasonOK                       = "ok"
	ReasonManifestSignatureInvalid = "manifest_signature_invalid"
	ReasonBinarySHA256Mismatch     = "binary_sha256_mismatch"
	ReasonBinaryGPGInvalid         = "binary_gpg_invalid"
	ReasonManifestFetchFailed      = "manifest_fetch_failed"
	ReasonDiskWriteFailed          = "disk_write_failed"
	ReasonUnknownPlugin            = "unknown_plugin"
)

// AllReasons 7-tuple 用于 reverse-grep drift 守门.
var AllReasons = []string{
	ReasonOK,
	ReasonManifestSignatureInvalid,
	ReasonBinarySHA256Mismatch,
	ReasonBinaryGPGInvalid,
	ReasonManifestFetchFailed,
	ReasonDiskWriteFailed,
	ReasonUnknownPlugin,
}

// PluginEntry mirrors server-side PluginManifestEntry shape byte-identical
// (hb_1_plugin_manifest.go §3.1 content-lock §1).
type PluginEntry struct {
	ID        string   `json:"id"`
	Version   string   `json:"version"`
	BinaryURL string   `json:"binary_url"`
	SHA256    string   `json:"sha256"`
	Signature string   `json:"signature"`
	Platforms []string `json:"platforms"`
}

// Envelope mirrors server-side PluginManifestResponse byte-identical:
// {"entries":[...], "signed_at": <unix-ms>, "signature": "<base64>"}.
type Envelope struct {
	Entries   []PluginEntry `json:"entries"`
	SignedAt  int64         `json:"signed_at"`
	Signature string        `json:"signature"`
}

// FetchError carries a 7-dict reason + underlying error.
type FetchError struct {
	Reason string
	Err    error
}

func (e *FetchError) Error() string {
	if e.Err == nil {
		return e.Reason
	}
	return fmt.Sprintf("%s: %v", e.Reason, e.Err)
}

func (e *FetchError) Unwrap() error { return e.Err }

// Fetch performs HTTP GET against HB-1 server endpoint + decodes envelope.
// Returns 7-dict ReasonManifestFetchFailed on transport / decode error.
func Fetch(ctx context.Context, client *http.Client, endpoint, bearerToken string) (*Envelope, error) {
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, &FetchError{Reason: ReasonManifestFetchFailed, Err: err}
	}
	if bearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+bearerToken)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, &FetchError{Reason: ReasonManifestFetchFailed, Err: err}
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, &FetchError{
			Reason: ReasonManifestFetchFailed,
			Err:    fmt.Errorf("HTTP %d", resp.StatusCode),
		}
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, &FetchError{Reason: ReasonManifestFetchFailed, Err: err}
	}
	var env Envelope
	if err := json.Unmarshal(body, &env); err != nil {
		return nil, &FetchError{Reason: ReasonManifestFetchFailed, Err: err}
	}
	return &env, nil
}

// CanonicalSignedBytes returns the byte sequence that the server signs:
// JSON of {entries, signed_at} byte-identical with server canonicalization
// (sort entries by ID + json.Marshal stable). 跟 server hb_1_plugin_manifest.go
// SignManifestPayload 同源.
func CanonicalSignedBytes(env *Envelope) ([]byte, error) {
	type signedShape struct {
		Entries  []PluginEntry `json:"entries"`
		SignedAt int64         `json:"signed_at"`
	}
	return json.Marshal(signedShape{Entries: env.Entries, SignedAt: env.SignedAt})
}

// Verify 验 ed25519 detached signature against public key.
// Bad sig → FetchError{Reason: ReasonManifestSignatureInvalid}. 反 v0(C) skip.
func Verify(env *Envelope, pubKey ed25519.PublicKey) error {
	if env == nil {
		return &FetchError{Reason: ReasonManifestSignatureInvalid, Err: errors.New("nil envelope")}
	}
	if len(pubKey) != ed25519.PublicKeySize {
		return &FetchError{Reason: ReasonManifestSignatureInvalid, Err: errors.New("bad pub key size")}
	}
	if env.Signature == "" {
		return &FetchError{Reason: ReasonManifestSignatureInvalid, Err: errors.New("empty signature")}
	}
	sig, err := base64.StdEncoding.DecodeString(env.Signature)
	if err != nil {
		return &FetchError{Reason: ReasonManifestSignatureInvalid, Err: err}
	}
	signed, err := CanonicalSignedBytes(env)
	if err != nil {
		return &FetchError{Reason: ReasonManifestSignatureInvalid, Err: err}
	}
	if !ed25519.Verify(pubKey, signed, sig) {
		return &FetchError{Reason: ReasonManifestSignatureInvalid, Err: errors.New("ed25519 verify failed")}
	}
	return nil
}
