import { ReactRenderer } from '@tiptap/react';
import Mention from '@tiptap/extension-mention';
import type { SuggestionOptions, SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import MentionList from '../components/MentionList';
import type { User } from '../types';

export interface MentionSuggestionItem {
  id: string;
  label: string;
  role: string;
}

export function createMentionExtension(getUsersFn: () => User[]) {
  return Mention.configure({
    HTMLAttributes: {
      class: 'mention',
    },
    renderText({ node }) {
      return `<@${node.attrs.id as string}>`;
    },
    renderHTML({ node }) {
      return ['span', { class: 'mention', 'data-id': node.attrs.id }, `@${(node.attrs.label as string) ?? (node.attrs.id as string)}`];
    },
    suggestion: {
      char: '@',
      allowedPrefixes: [' ', '\n', null] as unknown as string[],
      items: ({ query }: { query: string }) => {
        const users = getUsersFn();
        const q = query.toLowerCase();
        return users
          .filter(u => u.display_name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q))
          .slice(0, 10)
          .map(u => ({ id: u.id, label: u.display_name, role: u.role }));
      },
      render: () => {
        let component: ReactRenderer<{ onKeyDown: (props: SuggestionKeyDownProps) => boolean }> | null = null;
        let popup: HTMLDivElement | null = null;

        return {
          onStart: (props: SuggestionProps<MentionSuggestionItem>) => {
            popup = document.createElement('div');
            popup.className = 'mention-suggestion-popup';
            const container = props.decorationNode?.closest('.message-input-container');
            if (container) {
              container.appendChild(popup);
            } else {
              document.body.appendChild(popup);
            }

            component = new ReactRenderer(MentionList, {
              props: { ...props },
              editor: props.editor,
            });
            popup.appendChild(component.element);
          },
          onUpdate: (props: SuggestionProps<MentionSuggestionItem>) => {
            component?.updateProps(props);
          },
          onKeyDown: (props: SuggestionKeyDownProps) => {
            if (props.event.key === 'Escape') {
              popup?.remove();
              component?.destroy();
              popup = null;
              component = null;
              return true;
            }
            return component?.ref?.onKeyDown(props) ?? false;
          },
          onExit: () => {
            popup?.remove();
            component?.destroy();
            popup = null;
            component = null;
          },
        };
      },
    } as Partial<SuggestionOptions<MentionSuggestionItem>>,
  });
}
