import React, { useEffect } from 'react';

interface ConfirmDeleteModalProps {
  channelName: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

export default function ConfirmDeleteModal({ channelName, onConfirm, onCancel, loading }: ConfirmDeleteModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, loading]);

  return (
    <div className="modal-overlay" onClick={loading ? undefined : onCancel}>
      <div className="modal-content confirm-delete-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>删除频道</h3>
        </div>
        <div className="modal-body">
          <p className="confirm-delete-text">
            确定删除 <strong>#{channelName}</strong>？此操作不可恢复。
          </p>
          <div className="form-actions confirm-delete-actions">
            <button
              className="btn btn-sm"
              onClick={onCancel}
              disabled={loading}
            >
              取消
            </button>
            <button
              className="btn btn-sm btn-danger"
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? '删除中...' : '删除'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
