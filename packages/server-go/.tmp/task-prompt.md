# Task: Comprehensive Test Suite + CI Coverage Gate for Go Server

## Environment Setup (CRITICAL)
/tmp has `noexec` mount. You MUST set TMPDIR before running any Go tests:
```bash
export TMPDIR=/workspace/collab/packages/server-go/.tmp
export PATH="/usr/local/go/bin:$PATH"
```
Always include these exports before any `go test` command.

## Current State
- Branch: `feat/r01-tests-coverage` (already checked out)
- Current coverage: 21.9%
- Target: ≥ 85%
- Existing tests pass (auth, channels, messages, reactions, store, lexorank, hub, ws basic)
- One failing test: `TestWorkspacePermissions` in `internal/api/workspace_test.go` — the workspace file download/delete routes return 404. Fix this test to match actual API behavior.

## What You Must Do

### 1. Fix the failing workspace test
`internal/api/workspace_test.go` — `TestWorkspacePermissions` has 2 failing subtests:
- `NonMemberCannotDownload`: expects 403, gets 404
- `OwnerCanAccess`: expects 200 from DELETE, gets 404

The workspace file is inserted via `s.InsertWorkspaceFile(f)` but the API routes for workspace file access may use different paths or the `WorkspaceFile` model has a `created_at` time.Time scan issue with SQLite. Look at `internal/api/workspace.go` to understand the actual routes and fix the test assertions or setup to match reality.

### 2. Create new test files

All tests use `testutil.NewTestServer(t)` which gives an `*httptest.Server`, `*store.Store`, and `*config.Config`. Tests use `testutil.LoginAs()`, `testutil.JSON()`, `testutil.CreateChannel()`, `testutil.PostMessage()`.

**Create these test files:**

#### `internal/api/admin_test.go`
Test the admin API endpoints:
- `GET /api/v1/admin/users` — list users (admin only)
- `POST /api/v1/admin/users` — create user (with email/password, as agent, missing display_name → 400, invalid role → 400)
- `PATCH /api/v1/admin/users/{id}` — update user (display_name, role, disabled, cannot change own role)
- `DELETE /api/v1/admin/users/{id}` — delete user (cannot delete self, not found → 404)
- `POST /api/v1/admin/users/{id}/api-key` — generate API key
- `DELETE /api/v1/admin/users/{id}/api-key` — delete API key
- `GET /api/v1/admin/users/{id}/permissions` — get permissions (admin gets *, member gets list)
- `POST /api/v1/admin/users/{id}/permissions` — grant permission (duplicate → 409)
- `DELETE /api/v1/admin/users/{id}/permissions` — revoke permission (not found → 404)
- `POST /api/v1/admin/invites` — create invite (with/without expiry)
- `GET /api/v1/admin/invites` — list invites
- `DELETE /api/v1/admin/invites/{code}` — delete invite (not found → 404)
- `GET /api/v1/admin/channels` — list all channels
- `DELETE /api/v1/admin/channels/{id}/force` — force delete (cannot delete general, cannot delete DM)
- Non-admin user gets 403 for all admin endpoints

#### `internal/api/dm_test.go`
- `POST /api/v1/dm/{userId}` — create DM channel
- `POST /api/v1/dm/{userId}` with own ID → 400
- `POST /api/v1/dm/{userId}` with nonexistent user → 404
- Creating same DM twice returns same channel (idempotent)
- `GET /api/v1/dm` — list DMs

#### `internal/api/upload_test.go`
- `POST /api/v1/upload` with valid JPEG image → 201
- `POST /api/v1/upload` with PNG → 201
- `POST /api/v1/upload` with non-image file (text/plain) → 400
- `POST /api/v1/upload` with >10MB file → 413
- `POST /api/v1/upload` without file → 400
- Use `multipart/form-data` with `mime/multipart` package

#### `internal/api/sse_test.go`
Test SSE/stream and poll endpoints:
- `POST /api/v1/poll` with API key auth — poll for events
- `GET /api/v1/stream` with API key auth — SSE stream connection
- `HEAD /api/v1/stream` — stream head (auth check)
- `Last-Event-ID` header for SSE replay
- Create events (post a message), then poll to verify they appear

#### `internal/api/remote_test.go`
Test remote node API endpoints (these are HTTP REST, not WS):
- `POST /api/v1/remote/nodes` — create node
- `GET /api/v1/remote/nodes` — list nodes
- `DELETE /api/v1/remote/nodes/{id}` — delete node
- `POST /api/v1/remote/nodes/{id}/bindings` — create binding
- `GET /api/v1/remote/nodes/{id}/bindings` — list bindings
- `DELETE /api/v1/remote/bindings/{id}` — delete binding
Look at `internal/api/remote.go` for exact routes.

#### `internal/ws/plugin_test.go`
Test plugin WebSocket connections. Use `nhooyr.io/websocket` (imported as `github.com/coder/websocket` in go.mod):
- Connect with Bearer token via header
- Send ping, receive pong
- Send api_request (GET /api/v1/channels), receive api_response with channel data
- Connection without auth → rejected (401)
- Send api_request to POST a message, verify it works

#### `internal/ws/remote_test.go`
Test remote WebSocket connections:
- Create a remote node via store, get connection_token
- Connect with Bearer token
- Send ping, receive pong
- Connection without valid token → rejected
- Test request/response pattern

### 3. Add more tests to existing test files to boost coverage

Look at the source files and add tests for uncovered code paths:

**`internal/api/channels_test.go`** — add tests for:
- Update channel (PATCH)
- Delete channel (owner vs non-owner)
- Channel members (add/remove/list)
- Mark channel as read
- Channel groups CRUD
- Channel position reordering
- Private channel access control
- List channels with unread counts

**`internal/api/messages_test.go`** — add tests for:
- Edit message (own message, other's message → 403)
- Delete message (own, admin can delete others)
- Reply to message
- Search messages
- Message pagination (before/after cursors)
- Message with mentions

**`internal/api/reactions_test.go`** — add more edge cases:
- Add reaction to nonexistent message
- Remove reaction that doesn't exist
- Multiple reactions on same message

**`internal/api/auth_test.go`** — add tests for:
- Register with invite code
- Login with wrong password
- Get current user (/api/v1/users/me)
- Logout
- API key authentication

**`internal/api/poll_test.go`** — add more coverage

**`internal/ws/hub_test.go`** — add tests for hub operations

**`internal/ws/ws_test.go`** — add tests for client WebSocket

**`internal/store/store_test.go`** — add tests for:
- All uncovered Store methods in queries.go, queries_phase2b.go, queries_phase3.go
- Remote node CRUD
- Workspace file operations
- Event queries
- Channel group operations
- DM channel operations

**`internal/auth/auth_test.go`** — add tests for:
- Permission checking
- Password hashing
- API key middleware

### 4. Create coverage script
Create `packages/server-go/scripts/coverage.sh`:
```bash
#!/bin/bash
set -e
export TMPDIR="${TMPDIR:-/tmp/go-test}"
mkdir -p "$TMPDIR"
cd "$(dirname "$0")/.."
go test ./... -race -coverprofile=coverage.out
go tool cover -func=coverage.out | tail -1
```

### 5. Update Makefile
Add to `packages/server-go/Makefile` (don't remove existing targets):
```makefile
coverage:
	go test ./... -race -coverprofile=coverage.out
	go tool cover -func=coverage.out | tail -1

coverage-html:
	go test ./... -coverprofile=coverage.out
	go tool cover -html=coverage.out -o coverage.html
```

### 6. Update CI workflow
The existing `.github/workflows/ci.yml` has a `check` job for the TS server. Add a `go-test` job:
```yaml
  go-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.24'
      - name: Install dependencies
        run: cd packages/server-go && go mod download
      - name: Run tests with race detector
        run: cd packages/server-go && go test ./... -race -coverprofile=coverage.out
      - name: Check coverage threshold
        run: |
          COVERAGE=$(cd packages/server-go && go tool cover -func=coverage.out | grep total | awk '{print $3}' | sed 's/%//')
          echo "Total coverage: ${COVERAGE}%"
          if (( $(echo "$COVERAGE < 85" | bc -l) )); then
            echo "Coverage ${COVERAGE}% is below 85% threshold"
            exit 1
          fi
```

### 7. Verification
After writing all tests, run:
```bash
export TMPDIR=/workspace/collab/packages/server-go/.tmp
export PATH="/usr/local/go/bin:$PATH"
cd /workspace/collab/packages/server-go
go test ./... -count=1 -v 2>&1 | tail -30
go test ./... -coverprofile=coverage.out && go tool cover -func=coverage.out | tail -1
```

All tests MUST pass. Coverage MUST be ≥ 85%. If not, keep adding tests until it is.

Then check per-package coverage:
```bash
go tool cover -func=coverage.out | grep -E "^total|^collab-server" | head -20
```

If any package is very low, add more tests for that package.

### 8. Commit and Push
```bash
cd /workspace/collab
# Add .gitignore entry for .tmp
echo ".tmp/" >> packages/server-go/.gitignore
git add packages/server-go/internal/api/admin_test.go
git add packages/server-go/internal/api/dm_test.go
git add packages/server-go/internal/api/upload_test.go
git add packages/server-go/internal/api/sse_test.go
git add packages/server-go/internal/api/remote_test.go
git add packages/server-go/internal/ws/plugin_test.go
git add packages/server-go/internal/ws/remote_test.go
git add packages/server-go/internal/api/workspace_test.go
git add packages/server-go/internal/api/channels_test.go
git add packages/server-go/internal/api/messages_test.go
git add packages/server-go/internal/api/reactions_test.go
git add packages/server-go/internal/api/auth_test.go
git add packages/server-go/internal/api/poll_test.go
git add packages/server-go/internal/ws/hub_test.go
git add packages/server-go/internal/ws/ws_test.go
git add packages/server-go/internal/store/store_test.go
git add packages/server-go/internal/auth/auth_test.go
git add packages/server-go/scripts/coverage.sh
git add packages/server-go/Makefile
git add packages/server-go/.gitignore
git add .github/workflows/ci.yml
git commit -m "test(R01): comprehensive test suite + CI coverage gate (≥85%)"
git push origin feat/r01-tests-coverage
```

## Key Guidelines
- All tests use in-memory SQLite via `testutil.NewTestServer(t)`
- Use `t.TempDir()` for any file operations
- For upload tests, construct multipart form data properly
- For WebSocket tests, use the `github.com/coder/websocket` package (already in go.mod)
- ALWAYS set `TMPDIR` before `go test`
- Don't break existing tests
- The goal is real, meaningful coverage — not fake tests that don't test anything
- Read source files before writing tests to understand actual behavior
