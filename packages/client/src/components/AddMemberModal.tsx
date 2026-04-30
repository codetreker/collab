// AddMemberModal — CHN-11.3 add member modal.
// 文案 byte-identical 跟 docs/qa/chn-11-content-lock.md §2.
import React, { useState } from 'react';
import { addChannelMember } from '../lib/api';

interface Props {
  channelID: string;
  onAdded: (userId: string) => void;
  onCancel: () => void;
}

export function AddMemberModal({ channelID, onAdded, onCancel }: Props) {
  const [value, setValue] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  async function handleSubmit() {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await addChannelMember(channelID, value.trim());
      onAdded(value.trim());
    } catch {
      setError('添加成员失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="add-member-modal"
      data-testid="add-member-modal"
      role="dialog"
    >
      <h3>添加成员</h3>
      <input
        type="text"
        data-testid="add-member-input"
        placeholder="用户邮箱或 ID"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
      />
      {error && (
        <div data-testid="add-member-error" role="alert">
          {error}
        </div>
      )}
      <div className="add-member-actions">
        <button
          type="button"
          data-testid="add-member-submit"
          onClick={handleSubmit}
          disabled={busy}
        >
          添加
        </button>
        <button
          type="button"
          data-testid="add-member-cancel"
          onClick={onCancel}
          disabled={busy}
        >
          取消
        </button>
      </div>
    </div>
  );
}
