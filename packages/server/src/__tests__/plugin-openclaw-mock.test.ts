import { describe, it } from 'vitest';

describe('Plugin ↔ OpenClaw mock integration', () => {
  it.todo('Plugin startup → connects via WS');
  it.todo('outbound sendMessage → message appears in channel');
  it.todo('requireMention filter → only @-mentioned messages forwarded');
});

describe('Plugin SDK unit stubs', () => {
  describe('outbound', () => {
    it.todo('sendMessage serializes correctly');
    it.todo('sendReaction serializes correctly');
    it.todo('editMessage serializes correctly');
  });

  describe('ws-client', () => {
    it.todo('connects with apiKey');
    it.todo('reconnects on disconnect');
    it.todo('apiCall sends request and receives response');
    it.todo('apiCall times out after threshold');
  });

  describe('sse-client', () => {
    it.todo('parses SSE events');
    it.todo('resumes from cursor on reconnect');
  });

  describe('file-access', () => {
    it.todo('allows whitelisted paths');
    it.todo('rejects non-whitelisted paths');
  });

  describe('accounts', () => {
    it.todo('parses config from environment');
    it.todo('applies default values for missing fields');
  });
});
