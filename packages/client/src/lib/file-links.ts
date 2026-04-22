export const FILE_PATH_RE = /(?:^|\s)(\.{0,2}\/(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+\.[a-zA-Z0-9]+|(?:[a-zA-Z0-9._-]+\/)+[a-zA-Z0-9._-]+\.[a-zA-Z0-9]+)(?=\s|$|[,.)}\]])/g;

export interface FileLinkSegment {
  type: 'text' | 'path';
  value: string;
}

export function parseFileLinks(content: string): FileLinkSegment[] {
  const segments: FileLinkSegment[] = [];
  let lastIndex = 0;

  FILE_PATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = FILE_PATH_RE.exec(content)) !== null) {
    const fullMatch = match[0];
    const path = match[1]!;
    const pathStart = match.index + fullMatch.indexOf(path);

    if (pathStart > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, pathStart) });
    }
    segments.push({ type: 'path', value: path });
    lastIndex = pathStart + path.length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments;
}
