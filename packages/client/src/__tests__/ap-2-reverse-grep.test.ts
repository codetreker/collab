// AP-2 client — reverse-grep tests for ap-2-spec.md §2 anti-constraints.
//
// 反约束 (ap-2-spec.md §2 + content-lock §1+§3):
//   #1 14 capability tokens byte-identical 跟 server `auth.ALL` (count==14)
//   #3 role 名双语 0 hit in PermissionsView + lib/capabilities.ts (反 role bleed)
//   #5 admin god-mode UI 独立路径 (capabilityLabel 不挂 admin/* 路径)
//   #7 capabilityLabel helper 单源 (export 仅 1 hit)
import { describe, it, expect } from 'vitest';
// @ts-expect-error — node:module 没 @types/node, vitest node 上下文可达.
import { createRequire } from 'module';

const nodeRequire = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fs: any = nodeRequire('fs');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodePath: any = nodeRequire('path');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const url: any = nodeRequire('url');

const HERE = nodePath.dirname(url.fileURLToPath(import.meta.url));
const SRC_ROOT = nodePath.resolve(HERE, '..');

const AP2_FILES = [
  nodePath.join(SRC_ROOT, 'lib', 'capabilities.ts'),
  nodePath.join(SRC_ROOT, 'components', 'PermissionsView.tsx'),
];

function read(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

function listFiles(root: string, exts: string[]): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = nodePath.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        walk(full);
      } else if (exts.some((x) => e.name.endsWith(x))) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

describe('AP-2 ⭐ reverse-grep — content-lock §1+§3 anti-constraints', () => {
  it('§1 14 capability tokens count==14 in lib/capabilities.ts (CAPABILITY_TOKENS array)', () => {
    const body = read(AP2_FILES[0]);
    // count 14 的字面 token 单引号串.
    const tokens = [
      'read_channel',
      'write_channel',
      'delete_channel',
      'read_artifact',
      'write_artifact',
      'commit_artifact',
      'iterate_artifact',
      'rollback_artifact',
      'mention_user',
      'read_dm',
      'send_dm',
      'manage_members',
      'invite_user',
      'change_role',
    ];
    for (const t of tokens) {
      expect(body).toContain(`'${t}'`);
    }
  });

  it('§3 反 RBAC role 字面 (英 admin/editor/viewer/owner) 0 hit in AP-2 paths', () => {
    const patterns = [/\b(admin|editor|viewer|owner)\b/i];
    const hits: string[] = [];
    for (const f of AP2_FILES) {
      const body = read(f);
      for (const re of patterns) {
        const m = body.match(re);
        if (m) hits.push(`${f}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('§3 反 RBAC role 字面 (中 管理员/编辑者/查看者) 0 hit in AP-2 paths', () => {
    const re = /管理员|编辑者|查看者/;
    const hits: string[] = [];
    for (const f of AP2_FILES) {
      const body = read(f);
      const m = body.match(re);
      if (m) hits.push(`${f}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });

  it('§5 admin god-mode UI 独立路径 — capabilityLabel 不在 admin/* 路径出现 (除本反向 grep 锚)', () => {
    const adminRoot = nodePath.join(SRC_ROOT, 'components', 'admin');
    if (!fs.existsSync(adminRoot)) {
      // admin 路径未建独立目录 — pass.
      return;
    }
    const adminFiles = listFiles(adminRoot, ['.ts', '.tsx']);
    const hits: string[] = [];
    for (const f of adminFiles) {
      const body = read(f);
      if (/capabilityLabel\(/.test(body)) {
        hits.push(f);
      }
    }
    expect(hits).toEqual([]);
  });

  it('§7 capabilityLabel helper 单源 — `export function capabilityLabel` 在 production code 仅 1 hit', () => {
    const all = listFiles(SRC_ROOT, ['.ts', '.tsx']);
    // Exclude __tests__/ — test files reference helper name in regex literal,
    // production code 单源锁是要点.
    const productionFiles = all.filter((f) => !/__tests__/.test(f));
    const re = /export\s+function\s+capabilityLabel\b/;
    const hits = productionFiles.filter((f) => re.test(read(f)));
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatch(/lib\/capabilities\.ts$/);
  });
});
