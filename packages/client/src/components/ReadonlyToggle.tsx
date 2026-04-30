// ReadonlyToggle — CHN-15.3 owner-only toggle button.
//
// Spec: docs/implementation/modules/chn-15-spec.md §1 拆段 CHN-15.3.
// Content lock: docs/qa/chn-15-content-lock.md §1 + §2.1.
//
// DOM 锚 (改 = 改两处: 此组件 + content-lock §2.1):
//   - button[data-testid="readonly-toggle"][data-readonly={true|false}]
//   - title attr toggles 已恢复编辑 (when on) vs 已设为只读 (when off)
//   - text content + title use READONLY_LABEL.set_toast / unset_toast
//
// 反约束: 文案 byte-identical 跟 READONLY_LABEL; owner-only render
// (caller responsibility — only shows for channel.created_by).
import React, { useState } from 'react';
import {
  setChannelReadonly,
  unsetChannelReadonly,
  CHANNEL_READONLY_TOAST,
} from '../lib/api';
import { READONLY_LABEL } from '../lib/readonly';

interface ReadonlyToggleProps {
  channelId: string;
  initialReadonly?: boolean;
  onChange?: (readonly: boolean) => void;
  onError?: (toast: string) => void;
}

export default function ReadonlyToggle({
  channelId,
  initialReadonly = false,
  onChange,
  onError,
}: ReadonlyToggleProps) {
  const [readonly, setReadonly] = useState(initialReadonly);
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    const next = !readonly;
    try {
      const resp = next
        ? await setChannelReadonly(channelId)
        : await unsetChannelReadonly(channelId);
      setReadonly(resp.readonly);
      onChange?.(resp.readonly);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      // Map known error codes to toast literals; fall back to generic msg.
      const code = msg.replace(/^channel\/readonly\s+/, '');
      const toast = CHANNEL_READONLY_TOAST[code] ?? '只读切换失败';
      onError?.(toast);
    } finally {
      setBusy(false);
    }
  };

  // Content lock §2.1: label + title toggle on state.
  const label = readonly ? READONLY_LABEL.unset_toast : READONLY_LABEL.set_toast;

  return (
    <button
      type="button"
      className="readonly-toggle"
      data-testid="readonly-toggle"
      data-readonly={readonly ? 'true' : 'false'}
      title={label}
      aria-pressed={readonly}
      disabled={busy}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}
