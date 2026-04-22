import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);

marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && hljs.getLanguage(lang) ? lang : undefined;
      const highlighted = language
        ? hljs.highlight(text, { language }).value
        : escapeHtml(text);
      const langLabel = language ? `<span class="code-lang">${escapeHtml(language)}</span>` : '';
      return `<pre><code class="hljs${language ? ` language-${escapeHtml(language)}` : ''}">${langLabel}${highlighted}</code></pre>`;
    },
  },
});

export function renderMarkdown(text: string, mentionedUserIds?: string[], userMap?: Map<string, string>): string {
  let processed = text;

  // Unescape fenced code block delimiters that prosemirror-markdown escapes
  // when the user types backticks as plain text instead of using a codeBlock node
  processed = processed.replace(/^\\`\\`\\`(\w*)$/gm, '```$1');

  if (userMap) {
    processed = processed.replace(/<@([^>]+)>/g, (_match, userId: string) => {
      const displayName = userMap.get(userId);
      if (displayName) return `<span class="mention" title="${escapeHtml(userId)}">@${escapeHtml(displayName)}</span>`;
      return `@${escapeHtml(userId)}`;
    });
  }

  if (mentionedUserIds && mentionedUserIds.length > 0 && userMap) {
    for (const userId of mentionedUserIds) {
      const displayName = userMap.get(userId);
      if (displayName) {
        const regex = new RegExp(`@${escapeRegex(displayName)}(?![^<]*<\\/span>)`, 'g');
        processed = processed.replace(regex, `<span class="mention">@${displayName}</span>`);
      }
    }
  }

  const rawHtml = marked.parse(processed) as string;

  const clean = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div', 'img',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt', 'title'],
  });

  return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
