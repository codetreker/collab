// MemberList — CHN-11.3 channel member list with add + remove.
// 文案 byte-identical 跟 docs/qa/chn-11-content-lock.md §1.
import React from 'react';

interface Member {
  user_id: string;
  display_name: string;
}

interface Props {
  members: Member[];
  canManage: boolean;
  onAdd: () => void;
  onRemove: (m: Member) => void;
}

export function MemberList({ members, canManage, onAdd, onRemove }: Props) {
  if (!members || members.length === 0) return null;
  return (
    <div className="member-list" data-testid="member-list">
      <header className="member-list-header">
        <h3>成员</h3>
        {canManage && (
          <button
            type="button"
            data-testid="member-list-add"
            onClick={onAdd}
          >
            添加成员
          </button>
        )}
      </header>
      <ul className="member-list-rows">
        {members.map((m) => (
          <li
            key={m.user_id}
            className="member-list-row"
            data-member-user-id={m.user_id}
          >
            <span>{m.display_name}</span>
            {canManage && (
              <button
                type="button"
                data-testid={`member-remove-${m.user_id}`}
                onClick={() => onRemove(m)}
              >
                移除
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
