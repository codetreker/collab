import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb } from './db.js';
import {
  createChannel,
  createUser,
  addUserToPublicChannels,
  getChannelByName,
  getUserById,
  getUserByEmail,
} from './queries.js';

export function seed(): void {
  const db = getDb();

  // Admin user (legacy seed)
  const adminId = 'admin-jianjun';
  if (!getUserById(db, adminId)) {
    createUser(db, adminId, '建军', 'admin', null);
    console.log('[seed] Created admin user: 建军');
  }

  // Bootstrap admin from env vars
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const existing = getUserByEmail(db, adminEmail);
    if (!existing) {
      const id = `admin-${adminEmail}`;
      const passwordHash = bcrypt.hashSync(adminPassword, 10);
      createUser(db, id, adminEmail.split('@')[0]!, 'admin', null, adminEmail, passwordHash);
      console.log(`[seed] Created admin user from env: ${adminEmail}`);
    }
  }

  // Agent users
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
    createChannel(db, 'general', 'General discussion', adminId);
    console.log('[seed] Created #general channel');
  }

  // Add all users to public channels
  const allUsers = db.prepare('SELECT id FROM users').all() as { id: string }[];
  for (const u of allUsers) {
    addUserToPublicChannels(db, u.id);
  }
}
