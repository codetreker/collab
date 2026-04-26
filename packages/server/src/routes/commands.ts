import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import { commandStore } from '../command-store.js';
import * as Q from '../queries.js';

// ─── Builtin Commands ──────────────────────────────────

const BUILTIN_COMMANDS = [
  { name: 'help', description: '显示所有可用命令', usage: '/help', params: [] },
  { name: 'leave', description: '离开当前频道', usage: '/leave', params: [] },
  {
    name: 'topic',
    description: '设置频道主题',
    usage: '/topic <text>',
    params: [{ name: 'text', type: 'string', required: true }],
  },
  {
    name: 'invite',
    description: '邀请用户加入频道',
    usage: '/invite <username>',
    params: [{ name: 'username', type: 'string', required: true }],
  },
  {
    name: 'dm',
    description: '发送私信',
    usage: '/dm <username> [message]',
    params: [
      { name: 'username', type: 'string', required: true },
      { name: 'message', type: 'string', required: false },
    ],
  },
  { name: 'status', description: '查看在线状态', usage: '/status', params: [] },
  { name: 'clear', description: '清除聊天记录显示', usage: '/clear', params: [] },
  {
    name: 'nick',
    description: '修改显示名称',
    usage: '/nick <name>',
    params: [{ name: 'name', type: 'string', required: true }],
  },
] as const;

// ─── Route Registration ────────────────────────────────

export function registerCommandRoutes(app: FastifyInstance): void {
  app.get<{
    Querystring: { channelId?: string };
  }>('/api/v1/commands', async (request, reply) => {
    if (!request.currentUser) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const { channelId } = request.query;
    const db = getDb();

    // Agent commands grouped by agent
    const allGroups = commandStore.getAll();

    // When channelId is provided, filter to agents that are members of that channel
    let channelMemberIds: Set<string> | null = null;
    if (channelId) {
      const members = Q.getChannelMembers(db, channelId);
      channelMemberIds = new Set(members.map((m) => m.user_id));
    }

    const agentList = allGroups
      .filter((g) => !channelMemberIds || channelMemberIds.has(g.agentId));

    const uniqueAgentIds = [...new Set(agentList.map(g => g.agentId))];
    const displayNames = new Map<string, string>();
    if (uniqueAgentIds.length > 0) {
      const placeholders = uniqueAgentIds.map(() => '?').join(',');
      const rows = db.prepare(`SELECT id, display_name FROM users WHERE id IN (${placeholders})`).all(...uniqueAgentIds) as Array<{ id: string; display_name: string }>;
      for (const row of rows) {
        displayNames.set(row.id, row.display_name);
      }
    }

    const result = agentList.map((g) => ({
      agent_id: g.agentId,
      agent_name: displayNames.get(g.agentId) ?? g.agentId,
      commands: g.commands,
    }));

    return {
      builtin: BUILTIN_COMMANDS,
      agent: result,
    };
  });
}
