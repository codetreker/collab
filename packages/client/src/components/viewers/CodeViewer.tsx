import { useEffect, useRef } from 'react';
import hljs from 'highlight.js/lib/core';

const EXT_TO_LANG: Record<string, string> = {
  '.js': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.py': 'python',
  '.css': 'css',
  '.json': 'json',
  '.sh': 'bash', '.bash': 'bash',
  '.html': 'html', '.xml': 'xml',
  '.sql': 'sql',
  '.md': 'markdown',
};

export function CodeViewer({ content, filename }: { content: string; filename: string }) {
  const codeRef = useRef<HTMLElement>(null);
  const ext = filename.slice(filename.lastIndexOf('.'));
  const lang = EXT_TO_LANG[ext];

  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.textContent = content;
      if (lang && hljs.getLanguage(lang)) {
        hljs.highlightElement(codeRef.current);
      }
    }
  }, [content, lang]);

  return (
    <div className="code-viewer">
      {lang && <span className="code-lang">{lang}</span>}
      <pre>
        <code ref={codeRef} className={lang ? `language-${lang}` : ''}>
          {content}
        </code>
      </pre>
    </div>
  );
}

export function isCodeFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.'));
  return ext in EXT_TO_LANG;
}
