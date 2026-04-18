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

  // Agent users
  const agents = [
    { id: 'agent-pegasus', name: '飞马', key: 'col_pegasus_key_001' },
    { id: 'agent-mustang', name: '野马', key: 'col_mustang_key_001' },
    { id: 'agent-warhorse', name: '战马', key: 'col_warhorse_key_001' },
    { id: 'agent-firehorse', name: '烈马', key: 'col_firehorse_key_001' },
  ];

  for (const a of agents) {
    if (!getUserById(db, a.id)) {
      createUser(db, a.id, a.name, 'agent', a.key);
      console.log(`[seed] Created agent user: ${a.name}`);
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
