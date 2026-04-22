import fs from 'node:fs';
import path from 'node:path';

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  mtime: string;
}

export interface FileContent {
  content: string;
  mimeType: string;
  size: number;
}

export interface StatResult {
  size: number;
  mtime: string;
  isDirectory: boolean;
}

const MIME_MAP: Record<string, string> = {
  '.ts': 'text/typescript', '.tsx': 'text/typescript',
  '.js': 'text/javascript', '.jsx': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.html': 'text/html', '.htm': 'text/html',
  '.css': 'text/css',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.java': 'text/x-java',
  '.c': 'text/x-c', '.h': 'text/x-c',
  '.cpp': 'text/x-c++', '.hpp': 'text/x-c++',
  '.sh': 'text/x-shellscript',
  '.yml': 'text/yaml', '.yaml': 'text/yaml',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.env': 'text/plain',
  '.toml': 'text/toml',
  '.sql': 'text/x-sql',
};

const MAX_FILE_SIZE = 2 * 1024 * 1024;

export function isPathAllowed(targetPath: string, allowedDirs: string[]): boolean {
  const resolved = path.resolve(targetPath);
  return allowedDirs.some(dir => {
    const resolvedDir = path.resolve(dir);
    return resolved === resolvedDir || resolved.startsWith(resolvedDir + path.sep);
  });
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

export function ls(targetPath: string, allowedDirs: string[]): { entries: DirEntry[] } | { error: string } {
  if (!isPathAllowed(targetPath, allowedDirs)) {
    return { error: 'path_not_allowed' };
  }
  try {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    return {
      entries: entries.map(e => {
        const fullPath = path.join(targetPath, e.name);
        let size = 0;
        let mtime = '';
        try {
          const stat = fs.statSync(fullPath);
          size = stat.size;
          mtime = stat.mtime.toISOString();
        } catch { /* ignore */ }
        return { name: e.name, isDirectory: e.isDirectory(), size, mtime };
      }),
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { error: 'path_not_found' };
    }
    return { error: String(err) };
  }
}

export function readFile(filePath: string, allowedDirs: string[]): FileContent | { error: string } {
  if (!isPathAllowed(filePath, allowedDirs)) {
    return { error: 'path_not_allowed' };
  }
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return { error: 'is_directory' };
    }
    if (stat.size > MAX_FILE_SIZE) {
      return { error: 'file_too_large' };
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return { content, mimeType: getMimeType(filePath), size: stat.size };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { error: 'file_not_found' };
    }
    return { error: String(err) };
  }
}

export function stat(targetPath: string, allowedDirs: string[]): StatResult | { error: string } {
  if (!isPathAllowed(targetPath, allowedDirs)) {
    return { error: 'path_not_allowed' };
  }
  try {
    const s = fs.statSync(targetPath);
    return { size: s.size, mtime: s.mtime.toISOString(), isDirectory: s.isDirectory() };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { error: 'path_not_found' };
    }
    return { error: String(err) };
  }
}
