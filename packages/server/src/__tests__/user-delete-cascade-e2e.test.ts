import { describe, it, expect, vi } from 'vitest';

// Scenario 18: User cascade delete
// SKIPPED: DELETE /api/v1/users/:id API does not exist in the current codebase.
// The users route (routes/users.ts) only exposes GET /api/v1/users.
// This test should be implemented once a user deletion endpoint is added.

vi.mock('../db.js', () => ({
  getDb: () => ({}),
  closeDb: () => {},
}));

describe('Scenario 18: User cascade delete (e2e)', () => {
  it.skip('skipped — DELETE /api/v1/users/:id not implemented', () => {});
});
