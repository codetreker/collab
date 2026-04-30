// NotificationPrefDropdown.tsx — CHN-8.2 channel notification preference
// 三选一 dropdown.
//
// 反约束 (chn-8-content-lock.md §1+§2):
//   - <select> + option value="all"/"mention"/"none"
//   - 文案 byte-identical: `所有消息` 4 字 / `仅@提及` 4 字 / `不打扰` 3 字
//   - data-testid="notification-pref-dropdown"
//   - 同义词反向 reject: subscribe/unsubscribe/follow/snooze/订阅/关注
//   - 调用 lib/api.ts::setNotificationPref 单源
import { useState } from 'react';
import { setNotificationPref } from '../lib/api';
import type { NotifPref } from '../lib/notif_pref';

interface NotificationPrefDropdownProps {
  channelId: string;
  pref: NotifPref;
  onChange?: (pref: NotifPref) => void;
}

export function NotificationPrefDropdown({ channelId, pref, onChange }: NotificationPrefDropdownProps) {
  const [busy, setBusy] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as NotifPref;
    if (busy || next === pref) return;
    setBusy(true);
    try {
      await setNotificationPref(channelId, next);
      onChange?.(next);
    } catch {
      // toast handled upstream
    } finally {
      setBusy(false);
    }
  };

  return (
    <select
      className="notif-pref-dropdown"
      data-testid="notification-pref-dropdown"
      value={pref}
      disabled={busy}
      onChange={handleChange}
    >
      <option value="all">所有消息</option>
      <option value="mention">仅@提及</option>
      <option value="none">不打扰</option>
    </select>
  );
}

export default NotificationPrefDropdown;
