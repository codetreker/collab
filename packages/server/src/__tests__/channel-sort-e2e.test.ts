import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
  addChannelMember, authCookie, grantPermission, httpJson,
} from './setup.js';
import { connectAuthWS, waitForMessage, closeWsAndWait, sleep } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

describe('Channel Sort & Groups E2E', () => {
  let app: FastifyInstance;
  let port: number;
  let ownerId: string, ownerToken: string;
  let memberId: string, memberToken: string;
  let ch1Id: string, ch2Id: string, ch3Id: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    ownerId = seedAdmin(testDb, 'SortOwner');
    memberId = seedMember(testDb, 'SortMember');
    grantPermission(testDb, ownerId, 'message.send');
    grantPermission(testDb, memberId, 'message.send');
    ownerToken = authCookie(ownerId);
    memberToken = authCookie(memberId);

    // Seed three channels with known positions
    ch1Id = seedChannel(testDb, ownerId, 'sort-alpha');
    ch2Id = seedChannel(testDb, ownerId, 'sort-beta');
    ch3Id = seedChannel(testDb, ownerId, 'sort-gamma');
    testDb.prepare('UPDATE channels SET position = ? WHERE id = ?').run('0|aaaaaa', ch1Id);
    testDb.prepare('UPDATE channels SET position = ? WHERE id = ?').run('0|mmmmmm', ch2Id);
    testDb.prepare('UPDATE channels SET position = ? WHERE id = ?').run('0|zzzzzz', ch3Id);

    addChannelMember(testDb, ch1Id, ownerId);
    addChannelMember(testDb, ch1Id, memberId);
    addChannelMember(testDb, ch2Id, ownerId);
    addChannelMember(testDb, ch3Id, ownerId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  // ── 1. Sort persistence ─────────────────────────────────────────────
  it('reorder persists: move ch1 after ch3 → GET returns new order', async () => {
    // Move ch1 (alpha) to after ch3 (gamma) → order becomes beta, gamma, alpha
    const { status } = await httpJson(port, 'PUT', '/api/v1/channels/reorder', ownerToken, {
      channel_id: ch1Id,
      after_id: ch3Id,
    });
    expect(status).toBe(200);

    const { json } = await httpJson(port, 'GET', '/api/v1/channels', ownerToken);
    const names = json.channels.map((c: any) => c.name);
    expect(names.indexOf('sort-beta')).toBeLessThan(names.indexOf('sort-gamma'));
    expect(names.indexOf('sort-gamma')).toBeLessThan(names.indexOf('sort-alpha'));
  });

  // ── 2. Group full lifecycle ─────────────────────────────────────────
  it('group lifecycle: create → assign channel → verify → delete → channel ungrouped', async () => {
    // Create group
    const createRes = await httpJson(port, 'POST', '/api/v1/channel-groups', ownerToken, { name: 'Engineering' });
    expect(createRes.status).toBe(201);
    const groupId = createRes.json.group.id;
    expect(groupId).toBeDefined();

    // Move ch2 into the group
    const moveRes = await httpJson(port, 'PUT', '/api/v1/channels/reorder', ownerToken, {
      channel_id: ch2Id,
      after_id: null,
      group_id: groupId,
    });
    expect(moveRes.status).toBe(200);

    // GET channels returns group data
    const listRes = await httpJson(port, 'GET', '/api/v1/channels', ownerToken);
    expect(listRes.json.groups.some((g: any) => g.id === groupId && g.name === 'Engineering')).toBe(true);
    const ch2 = listRes.json.channels.find((c: any) => c.id === ch2Id);
    expect(ch2.group_id).toBe(groupId);

    // Delete the group
    const delRes = await httpJson(port, 'DELETE', `/api/v1/channel-groups/${groupId}`, ownerToken);
    expect(delRes.status).toBe(200);

    // Channel should be ungrouped
    const afterDel = await httpJson(port, 'GET', '/api/v1/channels', ownerToken);
    const ch2After = afterDel.json.channels.find((c: any) => c.id === ch2Id);
    expect(ch2After.group_id).toBeNull();
    expect(afterDel.json.groups.some((g: any) => g.id === groupId)).toBe(false);
  });

  // ── 3. Permission checks ───────────────────────────────────────────
  it('non-owner reorder → 403', async () => {
    const { status } = await httpJson(port, 'PUT', '/api/v1/channels/reorder', memberToken, {
      channel_id: ch1Id,
      after_id: null,
    });
    expect(status).toBe(403);
  });

  it('non-owner group operations → 403', async () => {
    // Create a group as owner first
    const { json } = await httpJson(port, 'POST', '/api/v1/channel-groups', ownerToken, { name: 'PermTest' });
    const groupId = json.group.id;

    // Non-owner rename → 403
    const renameRes = await httpJson(port, 'PUT', `/api/v1/channel-groups/${groupId}`, memberToken, { name: 'Hacked' });
    expect(renameRes.status).toBe(403);

    // Non-owner delete → 403
    const delRes = await httpJson(port, 'DELETE', `/api/v1/channel-groups/${groupId}`, memberToken);
    expect(delRes.status).toBe(403);

    // Non-owner reorder group → 403
    const reorderRes = await httpJson(port, 'PUT', '/api/v1/channel-groups/reorder', memberToken, {
      group_id: groupId,
      after_id: null,
    });
    expect(reorderRes.status).toBe(403);

    // Cleanup
    await httpJson(port, 'DELETE', `/api/v1/channel-groups/${groupId}`, ownerToken);
  });

  // ── 4. WS broadcast ────────────────────────────────────────────────
  it('reorder broadcasts channels_reordered via WS', { timeout: 10000 }, async () => {
    const ws = await connectAuthWS(port, ownerToken);
    wsConnections.push(ws);

    const reorderPromise = waitForMessage(ws, (m) => m.type === 'channels_reordered');
    await httpJson(port, 'PUT', '/api/v1/channels/reorder', ownerToken, {
      channel_id: ch2Id,
      after_id: null,
    });
    const event = await reorderPromise;
    expect(event.type).toBe('channels_reordered');
    expect(event.channel_id).toBe(ch2Id);
    expect(event.position).toBeDefined();
  });

  it('group CRUD broadcasts corresponding WS events', { timeout: 10000 }, async () => {
    const ws = await connectAuthWS(port, ownerToken);
    wsConnections.push(ws);

    // Create → group_created
    const createPromise = waitForMessage(ws, (m) => m.type === 'group_created');
    const { json: created } = await httpJson(port, 'POST', '/api/v1/channel-groups', ownerToken, { name: 'WS-Test' });
    const createEvent = await createPromise;
    expect(createEvent.group.name).toBe('WS-Test');
    const gId = created.group.id;

    // Rename → group_updated
    const renamePromise = waitForMessage(ws, (m) => m.type === 'group_updated');
    await httpJson(port, 'PUT', `/api/v1/channel-groups/${gId}`, ownerToken, { name: 'WS-Renamed' });
    const renameEvent = await renamePromise;
    expect(renameEvent.group.name).toBe('WS-Renamed');

    // Delete → group_deleted
    const deletePromise = waitForMessage(ws, (m) => m.type === 'group_deleted');
    await httpJson(port, 'DELETE', `/api/v1/channel-groups/${gId}`, ownerToken);
    const deleteEvent = await deletePromise;
    expect(deleteEvent.group_id).toBe(gId);
  });

  // ── 5. New channel gets default position ───────────────────────────
  it('newly created channel has position field in GET response', async () => {
    const newChName = 'sort-new-' + Date.now();
    const createRes = await httpJson(port, 'POST', '/api/v1/channels', ownerToken, { name: newChName });
    expect(createRes.status).toBe(201);

    const { json } = await httpJson(port, 'GET', '/api/v1/channels', ownerToken);
    const newCh = json.channels.find((c: any) => c.name === newChName);
    expect(newCh).toBeDefined();
    expect(newCh.position).toBeDefined();
    expect(typeof newCh.position).toBe('string');
    expect(newCh.position.length).toBeGreaterThan(0);
  });

  // ── 6. Cross-group drag ────────────────────────────────────────────
  it('drag channel from group A to group B updates group_id and position', async () => {
    // Create two groups
    const { json: gA } = await httpJson(port, 'POST', '/api/v1/channel-groups', ownerToken, { name: 'GroupA' });
    const { json: gB } = await httpJson(port, 'POST', '/api/v1/channel-groups', ownerToken, { name: 'GroupB' });

    // Put ch3 into group A
    await httpJson(port, 'PUT', '/api/v1/channels/reorder', ownerToken, {
      channel_id: ch3Id,
      after_id: null,
      group_id: gA.group.id,
    });

    // Drag ch3 from group A to group B
    const dragRes = await httpJson(port, 'PUT', '/api/v1/channels/reorder', ownerToken, {
      channel_id: ch3Id,
      after_id: null,
      group_id: gB.group.id,
    });
    expect(dragRes.status).toBe(200);
    expect(dragRes.json.channel.group_id).toBe(gB.group.id);

    // Verify via GET
    const { json } = await httpJson(port, 'GET', '/api/v1/channels', ownerToken);
    const ch3 = json.channels.find((c: any) => c.id === ch3Id);
    expect(ch3.group_id).toBe(gB.group.id);

    // Cleanup
    await httpJson(port, 'DELETE', `/api/v1/channel-groups/${gA.group.id}`, ownerToken);
    await httpJson(port, 'DELETE', `/api/v1/channel-groups/${gB.group.id}`, ownerToken);
  });
});
