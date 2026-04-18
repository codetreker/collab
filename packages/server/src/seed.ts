import crypto from 'node:crypto';
import { getDb } from './db.js';
import {
  createChannel,
  createUser,
  addChannelMember,
  getChannelByName,
  getUserById,
} from './queries.js';

/**
 * Seeds the database with initial data on first run:
 * - #general channel
 * - Admin user (建军)
 * - Agent users with API keys
 */
export function seed(): void {
  const db = getDb();

  // Admin user
  const adminId = 'admin-jianjun';
  if (!getUserById(db, adminId)) {
    createUser(db, adminId, '建军', 'admin', null);
    console.log('[seed] Created admin user: 建军');
  }

  // Agent users — API keys come from env vars or are auto-generated
  const agents = [
    { id: 'agent-pegasus', name: '飞马', envKey: 'AGENT_PEGASUS_API_KEY' },
    { id: 'agent-mustang', name: '野马', envKey: 'AGENT_MUSTANG_API_KEY' },
    { id: 'agent-warhorse', name: '战马', envKey: 'AGENT_WARHORSE_API_KEY' },
    { id: 'agent-firehorse', name: '烈马', envKey: 'AGENT_FIREHORSE_API_KEY' },
  ];

  for (const a of agents) {
    if (!getUserById(db, a.id)) {
      const key = process.env[a.envKey] || `col_${crypto.randomBytes(24).toString('hex')}`;
      createUser(db, a.id, a.name, 'agent', key);
      console.log(`[seed] Created agent user: ${a.name} (API key: ${key})`);
    }
  }

  // #general channel
  if (!getChannelByName(db, 'general')) {
    const ch = createChannel(db, 'general', 'General discussion', adminId);
    // Add all users to #general
    addChannelMember(db, ch.id, adminId);
    for (const a of agents) {
      addChannelMember(db, ch.id, a.id);
    }
    console.log('[seed] Created #general channel with all members');
  }
}
