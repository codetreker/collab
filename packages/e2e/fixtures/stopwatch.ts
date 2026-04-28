// fixtures/stopwatch.ts — INFRA-2 latency-measurement helper.
//
// Exists to support 野马 G2.4 hardline (邀请发出 → owner 端通知 ≤ 3s,
// stopwatch 截屏作 acceptance 证据). RT-0 (#40) is the first real consumer.
//
// Why it lives here and not inline in each test: every Phase 2 latency
// gate (G2.1 邀请审批 E2E, G2.2 离线 fallback E2E, G2.4 团队感知签字)
// will measure something against a deadline. Centralizing the contract
// (start / stop / annotate test info with measured latency for the
// HTML report) keeps the assertion shape identical across tests, which
// matters when 野马 reads the report.
//
// Usage (preview, RT-0 will land the first real call):
//
//   const sw = stopwatch();
//   await page.click('[data-testid=invite-send]');
//   await otherPage.waitForSelector('[data-testid=invitation-toast]');
//   sw.stop();
//   await sw.attach(testInfo, '邀请→通知 latency');
//   expect(sw.ms).toBeLessThanOrEqual(3000);
//
import type { TestInfo } from '@playwright/test';

export interface Stopwatch {
  /** Stop the watch. Idempotent — second call is a no-op. */
  stop(): void;
  /** Elapsed milliseconds. Throws if read before stop(). */
  readonly ms: number;
  /**
   * Attach the measurement to the Playwright HTML report so 野马 can
   * read it without opening the trace viewer.
   */
  attach(testInfo: TestInfo, label: string): Promise<void>;
}

export function stopwatch(): Stopwatch {
  const start = performance.now();
  let end: number | undefined;

  return {
    stop() {
      if (end === undefined) end = performance.now();
    },
    get ms(): number {
      if (end === undefined) {
        throw new Error('stopwatch: read .ms before stop()');
      }
      return Math.round(end - start);
    },
    async attach(testInfo, label) {
      if (end === undefined) {
        throw new Error('stopwatch: attach() before stop()');
      }
      const ms = Math.round(end - start);
      await testInfo.attach(label, {
        body: `${ms} ms\n`,
        contentType: 'text/plain',
      });
    },
  };
}
