import { useEffect } from 'react';

interface ClearConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ClearConfirmModal({ onConfirm, onCancel }: ClearConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-body">
          <p>确定清除本地聊天记录？此操作仅清除本地显示，不影响服务端数据。</p>
          <div className="form-actions">
            <button className="btn btn-sm" onClick={onCancel}>取消</button>
            <button className="btn btn-sm btn-danger" onClick={onConfirm}>清除</button>
          </div>
        </div>
      </div>
    </div>
  );
}
