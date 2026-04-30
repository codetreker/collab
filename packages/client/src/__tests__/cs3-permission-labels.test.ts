// CS-3.1 — Push permission labels 单测 (cs-3-content-lock §1).
import { describe, it, expect } from 'vitest';
import { PUSH_PERMISSION_LABELS, INSTALL_BUTTON_LABEL } from '../lib/cs3-permission-labels';

describe('CS-3.1 — PUSH_PERMISSION_LABELS byte-identical (蓝图 §1.4 + DL-4)', () => {
  it('TestCS31_PermissionLabels_4DictByteIdentical — 4 keys 跟 DL-4 PushPermissionState', () => {
    const keys = Object.keys(PUSH_PERMISSION_LABELS).sort();
    expect(keys).toEqual(['default', 'denied', 'granted', 'unsupported']);
  });

  it('TestCS31_PermissionLabels_LiteralByteIdentical — 字面 byte-identical 跟 content-lock §1', () => {
    expect(PUSH_PERMISSION_LABELS.granted).toBe('已开启通知');
    expect(PUSH_PERMISSION_LABELS.denied).toBe('通知已被浏览器拒绝, 请到浏览器设置开启');
    expect(PUSH_PERMISSION_LABELS.default).toBe('开启通知');
    // unsupported → 空 string (UI 不渲染, 沉默胜于假活物感)
    expect(PUSH_PERMISSION_LABELS.unsupported).toBe('');
  });

  it('TestCS31_InstallButtonLabel — 字面 byte-identical 跟蓝图 §1.1', () => {
    expect(INSTALL_BUTTON_LABEL).toBe('安装 Borgee 桌面应用');
  });

  it('TestCS31_NoSynonymDrift — 同义词反向 (cs-3-content-lock §1)', () => {
    const banned = ['下载客户端', '装个 app', '接收推送', '订阅通知', '权限被拒'];
    const allLabels = [...Object.values(PUSH_PERMISSION_LABELS), INSTALL_BUTTON_LABEL].join(' | ');
    for (const word of banned) {
      expect(allLabels.includes(word), `synonym drift: ${word}`).toBe(false);
    }
  });
});
