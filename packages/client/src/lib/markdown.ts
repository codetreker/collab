// ─── Markdown rendering with XSS protection ─────────────

import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,   // GitHub-flavored line breaks
  gfm: true,      // GitHub Flavored Markdown
});

/**
 * Render markdown text to sanitized HTML.
 * Mentions like @username are highlighted.
 */
export function renderMarkdown(text: string, mentionedUserIds?: string[], userMap?: Map<string, string>): string {
  // Replace @mentions with highlighted spans before markdown parsing
  let processed = text;
  if (mentionedUserIds && mentionedUserIds.length > 0 && userMap) {
    for (const userId of mentionedUserIds) {
      const displayName = userMap.get(userId);
      if (displayName) {
        // Replace @displayName with a span
        const regex = new RegExp(`@${escapeRegex(displayName)}`, 'g');
        processed = processed.replace(regex, `<span class="mention">@${displayName}</span>`);
      }
    }
  }

  // Also highlight any @word patterns that look like mentions (supports CJK and Unicode)
  processed = processed.replace(
    /@([\p{L}\p{N}_]+)/gu,
    (match, name) => {
      // Check if already wrapped
      if (processed.includes(`<span class="mention">${match}</span>`)) {
        return match;
      }
      return `<span class="mention">${match}</span>`;
    },
  );

  const rawHtml = marked.parse(processed) as string;
  
  // Sanitize with DOMPurify - allow mention spans
  const clean = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div', 'img',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt', 'title'],
  });

  // Make all links open in new tab
  return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
