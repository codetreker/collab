// KickConfirmModal — CHN-11.3 confirm member removal modal.
// 文案 byte-identical 跟 docs/qa/chn-11-content-lock.md §3.
import React, { useState } from 'react';
import { removeChannelMember } from '../lib/api';

interface Member {
  user_id: string;
  display_name: string;
}

interface Props {
  channelID: string;
  user: Member;
  onRemoved: (userId: string) => void;
  onCancel: () => void;
}

export function KickConfirmModal({ channelID, user, onRemoved, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await removeChannelMember(channelID, user.user_id);
      onRemoved(user.user_id);
    } catch {
      setError('移除成员失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="kick-confirm-modal"
      data-testid="kick-confirm-modal"
      role="dialog"
    >
      <h3>确认移除 {user.display_name}?</h3>
      {error && (
        <div data-testid="kick-confirm-error" role="alert">
          {error}
        </div>
      )}
      <div className="kick-confirm-actions">
        <button
          type="button"
          data-testid="kick-confirm-yes"
          onClick={handleConfirm}
          disabled={busy}
        >
          确认
        </button>
        <button
          type="button"
          data-testid="kick-confirm-no"
          onClick={onCancel}
          disabled={busy}
        >
          取消
        </button>
      </div>
    </div>
  );
}
