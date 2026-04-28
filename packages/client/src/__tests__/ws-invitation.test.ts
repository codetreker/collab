// ws-invitation.test.ts — RT-0 (#40) client vitest gap (REG-RT0-006).
//
// Validates the push pipeline without booting a real WebSocket:
//   1. dispatchInvitationPending fires the locked window CustomEvent
//      with the frame as `detail` (BPP-byte-identical schema preserved).
//   2. dispatchInvitationDecided fires the decided event likewise.
//   3. The event names exported from types/ws-frames are the exact
//      strings useWsHubFrames listens on (drift guard — if the lint
//      rename one but not the other, this catches it).
//
// Why mock-only: useWebSocket's two switch arms are 4-line
// passthroughs to these dispatchers; once the dispatchers are proven,
// the integration is by inspection. The real ws + UI ≤3s contract
// is the Playwright spec (cm-4-realtime.spec.ts), gated on the
// server-side push PR.

import { describe, it, expect, vi } from 'vitest';
import {
  dispatchInvitationPending,
  dispatchInvitationDecided,
} from '../hooks/useWsHubFrames';
import {
  INVITATION_PENDING_EVENT,
  INVITATION_DECIDED_EVENT,
  type AgentInvitationPendingFrame,
  type AgentInvitationDecidedFrame,
} from '../types/ws-frames';

const pendingFrame: AgentInvitationPendingFrame = {
  type: 'agent_invitation_pending',
  invitation_id: 'inv-1',
  requester_user_id: 'u-req',
  agent_id: 'ag-1',
  channel_id: 'ch-1',
  created_at: 1000,
  expires_at: 4000,
};

const decidedFrame: AgentInvitationDecidedFrame = {
  type: 'agent_invitation_decided',
  invitation_id: 'inv-1',
  state: 'approved',
  decided_at: 2000,
};

describe('dispatchInvitationPending', () => {
  it('fires INVITATION_PENDING_EVENT with the frame in detail', () => {
    const listener = vi.fn();
    window.addEventListener(INVITATION_PENDING_EVENT, listener);
    try {
      dispatchInvitationPending(pendingFrame);
    } finally {
      window.removeEventListener(INVITATION_PENDING_EVENT, listener);
    }

    expect(listener).toHaveBeenCalledTimes(1);
    const evt = listener.mock.calls[0][0] as CustomEvent<AgentInvitationPendingFrame>;
    expect(evt.detail).toEqual(pendingFrame);
    // Field-order discipline: every BPP-byte-identical key must round-trip.
    expect(Object.keys(evt.detail)).toEqual([
      'type',
      'invitation_id',
      'requester_user_id',
      'agent_id',
      'channel_id',
      'created_at',
      'expires_at',
    ]);
  });

  it('does not leak listener after dispatch (one-shot semantics)', () => {
    const listener = vi.fn();
    window.addEventListener(INVITATION_PENDING_EVENT, listener);
    window.removeEventListener(INVITATION_PENDING_EVENT, listener);
    dispatchInvitationPending(pendingFrame);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('dispatchInvitationDecided', () => {
  it('fires INVITATION_DECIDED_EVENT with the frame in detail', () => {
    const listener = vi.fn();
    window.addEventListener(INVITATION_DECIDED_EVENT, listener);
    try {
      dispatchInvitationDecided(decidedFrame);
    } finally {
      window.removeEventListener(INVITATION_DECIDED_EVENT, listener);
    }

    expect(listener).toHaveBeenCalledTimes(1);
    const evt = listener.mock.calls[0][0] as CustomEvent<AgentInvitationDecidedFrame>;
    expect(evt.detail).toEqual(decidedFrame);
    expect(Object.keys(evt.detail)).toEqual([
      'type',
      'invitation_id',
      'state',
      'decided_at',
    ]);
  });

  it('every terminal state round-trips through the event', () => {
    const listener = vi.fn();
    window.addEventListener(INVITATION_DECIDED_EVENT, listener);
    try {
      for (const state of ['approved', 'rejected', 'expired'] as const) {
        dispatchInvitationDecided({ ...decidedFrame, state });
      }
    } finally {
      window.removeEventListener(INVITATION_DECIDED_EVENT, listener);
    }
    expect(listener).toHaveBeenCalledTimes(3);
    const states = listener.mock.calls.map(
      c => (c[0] as CustomEvent<AgentInvitationDecidedFrame>).detail.state,
    );
    expect(states).toEqual(['approved', 'rejected', 'expired']);
  });
});

describe('event-name lock', () => {
  // Drift guard: Sidebar.tsx hard-codes these strings (legacy no-import
  // shape) — if the constants ever rename, the bell badge silently
  // stops refreshing. Pin the literals.
  it('INVITATION_PENDING_EVENT === borgee:invitation-pending', () => {
    expect(INVITATION_PENDING_EVENT).toBe('borgee:invitation-pending');
  });
  it('INVITATION_DECIDED_EVENT === borgee:invitation-decided', () => {
    expect(INVITATION_DECIDED_EVENT).toBe('borgee:invitation-decided');
  });
});
