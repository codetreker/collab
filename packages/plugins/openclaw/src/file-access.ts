import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const DEFAULT_MAX_FILE_SIZE = 1_048_576; // 1 MB

interface FileAccessConfig {
  allowedPaths: string[];
  maxFileSize: number;
}

let cachedConfig: FileAccessConfig | null = null;

export async function loadConfig(): Promise<FileAccessConfig> {
  if (cachedConfig) return cachedConfig;
  const configPath = path.join(os.homedir(), '.config', 'collab', 'file-access.json');
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<FileAccessConfig>;
    cachedConfig = {
      allowedPaths: Array.isArray(parsed.allowedPaths) ? parsed.allowedPaths : [],
      maxFileSize: typeof parsed.maxFileSize === 'number' ? parsed.maxFileSize : DEFAULT_MAX_FILE_SIZE,
    };
  } catch {
    cachedConfig = { allowedPaths: [], maxFileSize: DEFAULT_MAX_FILE_SIZE };
  }
  return cachedConfig;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}

export function isPathAllowed(filePath: string, allowedPaths: string[]): boolean {
  const resolved = path.resolve(filePath);
  return allowedPaths.some((allowed) => {
    const resolvedAllowed = path.resolve(allowed);
    return resolved === resolvedAllowed || resolved.startsWith(resolvedAllowed + '/');
  });
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.ts': 'text/typescript', '.tsx': 'text/typescript',
    '.js': 'text/javascript', '.jsx': 'text/javascript',
    '.json': 'application/json', '.md': 'text/markdown',
    '.html': 'text/html', '.css': 'text/css',
    '.py': 'text/x-python', '.rs': 'text/x-rust',
    '.go': 'text/x-go', '.java': 'text/x-java',
    '.c': 'text/x-c', '.cpp': 'text/x-c++',
    '.h': 'text/x-c', '.sh': 'text/x-shellscript',
    '.yaml': 'text/yaml', '.yml': 'text/yaml',
    '.xml': 'application/xml', '.svg': 'image/svg+xml',
    '.txt': 'text/plain', '.log': 'text/plain',
    '.toml': 'text/toml', '.ini': 'text/plain',
    '.env': 'text/plain', '.sql': 'text/x-sql',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}

export async function readFile(filePath: string): Promise<{ content: string; size: number; mime_type: string } | { error: string }> {
  const config = await loadConfig();

  if (!isPathAllowed(filePath, config.allowedPaths)) {
    return { error: 'path_not_allowed' };
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      return { error: 'file_not_found' };
    }
    if (stat.size > config.maxFileSize) {
      return { error: 'file_too_large' };
    }
    const content = await fs.readFile(filePath, 'utf-8');
    return { content, size: stat.size, mime_type: getMimeType(filePath) };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { error: 'file_not_found' };
    }
    return { error: 'file_not_found' };
  }
}
