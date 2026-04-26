/**
 * OpenClaw Mock Harness — stub implementation.
 * Depends on Plugin SDK (openclaw/plugin-sdk) which is not yet available.
 * All methods are stubs annotated with TODO.
 */

export interface MockAccount {
  id: string;
  apiKey: string;
}

export interface MockContext {
  channelId: string;
  agentId: string;
}

export class OpenClawMockHarness {
  private controller: AbortController;
  readonly inbound: unknown[] = [];

  constructor() {
    this.controller = new AbortController();
  }

  // TODO: Implement when Plugin SDK is available
  async createAccount(_name: string): Promise<MockAccount> {
    throw new Error('Not implemented — depends on Plugin SDK');
  }

  // TODO: Implement when Plugin SDK is available
  async createContext(_account: MockAccount): Promise<MockContext> {
    throw new Error('Not implemented — depends on Plugin SDK');
  }

  // TODO: Implement when Plugin SDK is available
  async sendMessage(_ctx: MockContext, _content: string): Promise<void> {
    throw new Error('Not implemented — depends on Plugin SDK');
  }

  // TODO: Implement when Plugin SDK is available
  async waitForInbound(_filter?: (msg: unknown) => boolean): Promise<unknown> {
    throw new Error('Not implemented — depends on Plugin SDK');
  }

  shutdown(): void {
    this.controller.abort();
  }
}
