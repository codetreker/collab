import React, { useState } from 'react';
import { createChannelGroup } from '../lib/api';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateGroupModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await createChannelGroup(name.trim());
      onCreated();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={e => e.key === 'Escape' && onClose()}>
      <div className="modal-content create-group-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>创建分组</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <input
            type="text"
            className="input-field"
            style={{ width: '100%', marginBottom: 12 }}
            placeholder="分组名称"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          <div className="form-actions">
            <button type="submit" disabled={creating || !name.trim()} className="btn btn-primary btn-sm">
              {creating ? '创建中...' : '创建'}
            </button>
            <button type="button" onClick={onClose} className="btn btn-sm">取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
