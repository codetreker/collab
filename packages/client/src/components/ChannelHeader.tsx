// ChannelHeader — CHN-10.3 channel description display row.
// 文案 byte-identical 跟 docs/qa/chn-10-content-lock.md §2.
import React from 'react';

interface Props {
  description: string | null | undefined;
  onEdit?: () => void;
}

export function ChannelHeader({ description, onEdit }: Props) {
  if (!description || description.trim() === '') {
    return null;
  }
  return (
    <div
      className="channel-header-description"
      data-testid="channel-header-description"
    >
      {description}
      {onEdit && (
        <button
          type="button"
          className="description-edit-trigger"
          data-testid="description-edit-trigger"
          onClick={onEdit}
        >
          编辑
        </button>
      )}
    </div>
  );
}
