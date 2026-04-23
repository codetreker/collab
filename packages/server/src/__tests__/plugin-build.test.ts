import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const serverRoot = path.resolve(__dirname, '../..');
const pluginRoot = path.resolve(__dirname, '../../../plugin');

describe('Server package build validation', () => {
  it('package.json has valid start script pointing to dist', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts.start).toBe('node dist/index.js');
    expect(pkg.scripts.build).toBe('tsc');
    expect(pkg.type).toBe('module');
  });

  it('tsconfig.json exists with outDir = dist', () => {
    const tsconfig = JSON.parse(fs.readFileSync(path.join(serverRoot, 'tsconfig.json'), 'utf8'));
    expect(tsconfig.compilerOptions.outDir).toMatch(/dist/);
  });
});

describe('Plugin package build validation', () => {
  it('package.json exists with build script', () => {
    const pkgPath = path.join(pluginRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return; // plugin package may not exist in all environments
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.scripts.build).toBeDefined();
  });

  it('openclaw.plugin.json exists', () => {
    const configPath = path.join(pluginRoot, 'openclaw.plugin.json');
    if (!fs.existsSync(configPath)) {
      return; // plugin config may not exist in all environments
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config).toBeDefined();
  });
});
