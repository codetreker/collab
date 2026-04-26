#!/usr/bin/env node
import { Command } from 'commander';
import { RemoteAgent } from './agent.js';

const program = new Command();

program
  .name('borgee-remote-agent')
  .description('Borgee Remote Agent — expose local directories to Borgee server')
  .requiredOption('--server <url>', 'Borgee server WebSocket URL (e.g. ws://localhost:4900)')
  .requiredOption('--token <token>', 'Connection token from Borgee UI')
  .requiredOption('--dirs <dirs>', 'Comma-separated list of directories to expose')
  .parse(process.argv);

const opts = program.opts<{ server: string; token: string; dirs: string }>();

const dirs = opts.dirs.split(',').map(d => d.trim()).filter(Boolean);
if (dirs.length === 0) {
  console.error('Error: at least one directory is required');
  process.exit(1);
}

console.log(`[remote-agent] Allowed directories: ${dirs.join(', ')}`);

const agent = new RemoteAgent(opts.server, opts.token, dirs);
agent.connect();

process.on('SIGINT', () => {
  console.log('[remote-agent] Shutting down...');
  agent.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  agent.close();
  process.exit(0);
});
