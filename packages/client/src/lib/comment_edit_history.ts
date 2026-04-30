// CV-15 artifact comment edit history — 3 文案 byte-identical 跟 DM-7
// EditHistoryModal §1 文案锁同源 + content-lock §1 同源.
// 改三处 (改一处 = 改三处守 drift): server const + client const + content-lock.

export const COMMENT_EDIT_HISTORY_LABEL = {
  title:  '编辑历史',
  empty:  '暂无编辑记录',
  count:  '共 N 次编辑',  // 渲染时把 N 替换为实际数字
} as const;
