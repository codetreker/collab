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
  let processed = text;

  // Replace <@user_id> tokens with highlighted display names
  if (userMap) {
    processed = processed.replace(/<@([^>]+)>/g, (_match, userId: string) => {
      const displayName = userMap.get(userId);
      if (displayName) return `<span class="mention" title="${escapeHtml(userId)}">@${escapeHtml(displayName)}</span>`;
      return `@${escapeHtml(userId)}`;
    });
  }

  // Backward compat: highlight @displayName for old messages with known mentioned user IDs
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

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
