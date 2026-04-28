// agent-invitations.test.ts — CM-4.2 client API + decision logic.
// Use vi.stubGlobal('fetch', ...) so tsc strict mode doesn't choke on
// `globalThis.fetch = mock` (Mock type ≠ fetch signature). Dynamic-import
// the API module after the stub so the closure captures the spy.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('agent invitations API client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function ok(body: unknown) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });
  }

  function fail(status: number, error: string) {
    return Promise.resolve({
      ok: false,
      status,
      statusText: error,
      json: () => Promise.resolve({ error }),
    });
  }

  it('createAgentInvitation POSTs to /api/v1/agent_invitations with channel + agent', async () => {
    fetchMock.mockReturnValue(ok({
      invitation: {
        id: 'inv-1',
        channel_id: 'ch-1',
        agent_id: 'ag-1',
        requested_by: 'u-1',
        state: 'pending',
        created_at: 1,
      },
    }));
    const { createAgentInvitation } = await import('../lib/api');
    const inv = await createAgentInvitation('ch-1', 'ag-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/v1/agent_invitations');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ channel_id: 'ch-1', agent_id: 'ag-1' });
    expect(inv.id).toBe('inv-1');
    expect(inv.state).toBe('pending');
  });

  it('createAgentInvitation includes expires_at when provided', async () => {
    fetchMock.mockReturnValue(ok({ invitation: stub() }));
    const { createAgentInvitation } = await import('../lib/api');
    await createAgentInvitation('ch-1', 'ag-1', 9999);

    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({
      channel_id: 'ch-1',
      agent_id: 'ag-1',
      expires_at: 9999,
    });
  });

  it('listAgentInvitations defaults role=owner', async () => {
    fetchMock.mockReturnValue(ok({ invitations: [stub(), stub()] }));
    const { listAgentInvitations } = await import('../lib/api');
    const list = await listAgentInvitations();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('role=owner');
    expect(list).toHaveLength(2);
  });

  it('listAgentInvitations forwards role=requester', async () => {
    fetchMock.mockReturnValue(ok({ invitations: [] }));
    const { listAgentInvitations } = await import('../lib/api');
    await listAgentInvitations('requester');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('role=requester');
  });

  it('fetchAgentInvitation hits /{id}', async () => {
    fetchMock.mockReturnValue(ok({ invitation: stub({ id: 'inv-42' }) }));
    const { fetchAgentInvitation } = await import('../lib/api');
    const inv = await fetchAgentInvitation('inv-42');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/v1/agent_invitations/inv-42');
    expect(inv.id).toBe('inv-42');
  });

  it('decideAgentInvitation PATCHes with {state}', async () => {
    fetchMock.mockReturnValue(ok({
      invitation: stub({ state: 'approved', decided_at: 5000 }),
    }));
    const { decideAgentInvitation } = await import('../lib/api');
    const inv = await decideAgentInvitation('inv-1', 'approved');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/v1/agent_invitations/inv-1');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ state: 'approved' });
    expect(inv.state).toBe('approved');
    expect(inv.decided_at).toBe(5000);
  });

  it('decideAgentInvitation surfaces 409 as ApiError (terminal/illegal transition)', async () => {
    fetchMock.mockReturnValue(fail(409, 'invalid transition'));
    const { decideAgentInvitation, ApiError } = await import('../lib/api');

    await expect(decideAgentInvitation('inv-1', 'approved')).rejects.toBeInstanceOf(ApiError);
    try {
      await decideAgentInvitation('inv-1', 'approved');
    } catch (err) {
      expect((err as InstanceType<typeof ApiError>).status).toBe(409);
    }
  });

  it('decideAgentInvitation supports rejected', async () => {
    fetchMock.mockReturnValue(ok({
      invitation: stub({ state: 'rejected', decided_at: 5000 }),
    }));
    const { decideAgentInvitation } = await import('../lib/api');
    const inv = await decideAgentInvitation('inv-1', 'rejected');

    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ state: 'rejected' });
    expect(inv.state).toBe('rejected');
  });
});

describe('stateToLabel', () => {
  it('maps every state to a non-empty Chinese label', async () => {
    const { stateToLabel } = await import('../components/InvitationsInbox');
    for (const s of ['pending', 'approved', 'rejected', 'expired'] as const) {
      const label = stateToLabel(s);
      expect(label).toBeTruthy();
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

function stub(overrides: Partial<{
  id: string;
  channel_id: string;
  agent_id: string;
  requested_by: string;
  state: 'pending' | 'approved' | 'rejected' | 'expired';
  created_at: number;
  decided_at: number;
  expires_at: number;
}> = {}) {
  return {
    id: 'inv-1',
    channel_id: 'ch-1',
    agent_id: 'ag-1',
    requested_by: 'u-1',
    state: 'pending' as const,
    created_at: 1,
    ...overrides,
  };
}
