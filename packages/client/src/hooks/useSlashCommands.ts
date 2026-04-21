import { useState, useCallback, useMemo } from 'react';
import { commandRegistry } from '../commands/registry';
import type { CommandDefinition } from '../commands/registry';

interface UseSlashCommandsReturn {
  isActive: boolean;
  filtered: CommandDefinition[];
  selectedIndex: number;
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  close: () => void;
  setSelectedIndex: (i: number) => void;
}

export function useSlashCommands(text: string): UseSlashCommandsReturn {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const isActive = text.startsWith('/') && !text.includes(' ') && !dismissed;

  const prefix = isActive ? text.slice(1) : '';
  const filtered = useMemo(
    () => (isActive ? commandRegistry.search(prefix) : []),
    [isActive, prefix],
  );

  const close = useCallback(() => {
    setDismissed(true);
    setSelectedIndex(0);
  }, []);

  // Reset dismissed when text changes back to non-slash or empty
  useMemo(() => {
    if (!text.startsWith('/') || text === '') {
      setDismissed(false);
      setSelectedIndex(0);
    }
  }, [text]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isActive || filtered.length === 0) return false;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return true;
      }
      return false;
    },
    [isActive, filtered.length, close],
  );

  return { isActive, filtered, selectedIndex, handleKeyDown, close, setSelectedIndex };
}
