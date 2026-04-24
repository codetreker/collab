import { useState, useCallback, useMemo, useEffect } from 'react';
import { commandRegistry } from '../commands/registry';
import type { CommandDefinition, RemoteCommand, CommandGroup } from '../commands/registry';

interface UseSlashCommandsReturn {
  isActive: boolean;
  filtered: CommandGroup[];
  totalCount: number;
  selectedIndex: number;
  selectedItem: CommandDefinition | RemoteCommand | undefined;
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  close: () => void;
  setSelectedIndex: (i: number) => void;
}

function getItemAtFlatIndex(groups: CommandGroup[], index: number): CommandDefinition | RemoteCommand | undefined {
  let offset = 0;
  for (const group of groups) {
    if (index < offset + group.items.length) {
      return group.items[index - offset];
    }
    offset += group.items.length;
  }
  return undefined;
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

  const totalCount = useMemo(
    () => filtered.reduce((sum, g) => sum + g.items.length, 0),
    [filtered],
  );

  const selectedItem = useMemo(
    () => getItemAtFlatIndex(filtered, selectedIndex),
    [filtered, selectedIndex],
  );

  const close = useCallback(() => {
    setDismissed(true);
    setSelectedIndex(0);
  }, []);

  useEffect(() => {
    if (!text.startsWith('/') || text === '') {
      setDismissed(false);
      setSelectedIndex(0);
    }
  }, [text]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isActive || totalCount === 0) return false;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, totalCount - 1));
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
    [isActive, totalCount, close],
  );

  return { isActive, filtered, totalCount, selectedIndex, selectedItem, handleKeyDown, close, setSelectedIndex };
}
