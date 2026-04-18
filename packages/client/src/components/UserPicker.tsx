import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { setDevUserId, getDevUserId } from '../lib/api';

export default function UserPicker() {
  const { state, actions } = useAppContext();
  const [selectedId, setSelectedId] = useState(getDevUserId() ?? '');

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const userId = e.target.value;
    setSelectedId(userId);
    setDevUserId(userId || null);
    if (userId) {
      await actions.loadCurrentUser();
      // Reload data with new user context
      await actions.loadChannels();
    }
  };

  return (
    <div className="user-picker">
      <label className="user-picker-label">Dev 身份:</label>
      <select
        className="user-picker-select"
        value={selectedId}
        onChange={handleChange}
      >
        <option value="">选择用户</option>
        {state.users.map(user => (
          <option key={user.id} value={user.id}>
            {user.display_name} ({user.role})
          </option>
        ))}
      </select>
    </div>
  );
}
