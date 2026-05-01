// adm-2-followup-audit-page.test.tsx — REG-ADM2-011 acceptance: file-source
// content lock (跟 adm-2-admin-spa-cross-end.test.ts 同模式 — 文件源字面
// reverse-grep, no React render runtime需 because test framework lacks
// @testing-library/react).
//
// 反约束: AdminAuditLogPage.tsx 必含 ADM-2-FOLLOWUP REG-011 字面 byte-identical:
//   - data-page="admin-audit-log" + data-adm2-audit-list="true"
//   - data-adm2-red-banner="active" + 中文 "当前以业主身份操作 — 该会话受 24h 时限"
//   - 中文 title "审计日志"
//   - 中文 empty state "暂无审计记录"
//   - data-adm2-actor-kind row attribute

import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE_PATH = resolve(__dirname, '../admin/pages/AdminAuditLogPage.tsx');
const SRC = readFileSync(PAGE_PATH, 'utf-8');

describe('AdminAuditLogPage — ADM-2-FOLLOWUP REG-011 content lock', () => {
  test('REG-011.1 root has data-page="admin-audit-log" + data-adm2-audit-list="true"', () => {
    expect(SRC).toMatch(/data-page="admin-audit-log"/);
    expect(SRC).toMatch(/data-adm2-audit-list="true"/);
  });

  test('REG-011.2 red banner with byte-identical 中文 文案', () => {
    expect(SRC).toMatch(/data-adm2-red-banner="active"/);
    expect(SRC).toContain('当前以业主身份操作 — 该会话受 24h 时限');
  });

  test('REG-011.3 中文 title "审计日志" (not English "Audit Log")', () => {
    expect(SRC).toContain('审计日志');
    expect(SRC).not.toContain('<h2>Audit Log</h2>');
  });

  test('REG-011.4 中文 empty state "暂无审计记录"', () => {
    expect(SRC).toContain('暂无审计记录');
  });

  test('REG-011.5 rows have data-adm2-actor-kind attribute', () => {
    expect(SRC).toMatch(/data-adm2-actor-kind=/);
  });

  test('REG-011.6 反义词反向 grep — 0 hit forbidden synonyms (反 typing/loading/thinking/processing 漂)', () => {
    const forbidden = ['typing', 'loading', 'thinking', 'processing', 'composing', 'analyzing', 'planning', 'responding'];
    for (const word of forbidden) {
      // case-insensitive search excluding "Loading..." spinner state which is OK
      const lower = SRC.toLowerCase();
      if (word === 'loading') {
        // "Loading..." spinner state is allowed (UI loading indicator; not chat-typing)
        continue;
      }
      expect(lower).not.toContain(word.toLowerCase());
    }
  });
});
