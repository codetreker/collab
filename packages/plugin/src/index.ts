/**
 * Collab Channel Plugin for OpenClaw
 *
 * Skeleton for Phase 1. Full implementation in Phase 3 (COL-T13/T14/T15).
 * This file documents the planned architecture.
 */

export interface CollabPluginConfig {
  baseUrl: string;
  apiKey: string;
  botUserId: string;
  botDisplayName: string;
}

export interface CollabEvent {
  cursor: number;
  kind: 'message' | 'message_edited' | 'message_deleted';
  channel_id: string;
  payload: string;
}

// Plugin entry point — will be implemented in Phase 3
export function createCollabPlugin(_config: CollabPluginConfig): void {
  console.log('[collab-plugin] Plugin skeleton loaded. Full implementation pending.');
}
