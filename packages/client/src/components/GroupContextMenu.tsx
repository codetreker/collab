import React, { useEffect, useRef } from 'react';

interface Props {
  position: { x: number; y: number };
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export default function GroupContextMenu({ position, onClose, onRename, onDelete }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="group-context-menu"
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="group-context-menu-item"
        onClick={() => { onRename(); onClose(); }}
      >
        重命名
      </div>
      <div
        className="group-context-menu-item danger"
        onClick={onDelete}
      >
        删除
      </div>
    </div>
  );
}
