# Acceptance Template — ADM-2: 分层透明 audit (用户可见性)

> 蓝图: `docs/blueprint/admin-model.md` §1.4 (L82-105, "谁能看到什么" 四档分层 + 三条红线)
> 蓝图不变量: §2 (L109-120, "受影响者必感知" + "Audit 100% 留痕" + "Audit 分层可见")
> Implementation: `docs/implementation/modules/admin-model.md` §ADM-2 (L57-68, R2 取消 ⭐ 标志性)
> R2 决议: 野马取消 ⭐ — 普通用户零感知, 不进野马签字闸 4 (内部 milestone)
> 依赖: ADM-1 (隐私承诺页, PR #228) 已落
> Owner: 战马B 实施 / 烈马 验收

## 拆 PR 顺序 (单 PR)

- **ADM-2**: `admin_actions(actor_id, target_user_id, action, when)` 表 + admin SPA 任意 action 自动写一行 + 用户设置页 `/api/v1/me/admin-actions` 列表 + 受影响者必收 system message (蓝图 §1.4 红线 1)

## 验收清单

### 数据契约 (蓝图 §2 不变量)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| `admin_actions` schema 字段 (id / actor_id FK admins / target_user_id FK users / action text / created_at) + 索引 (target_user_id, created_at) | unit + migration test | 战马B / 烈马 | _(待填)_ |
| admin action 类型枚举 (delete_channel / suspend_user / change_role / start_impersonation 等) DB CHECK 约束 | unit | 战马B / 烈马 | _(待填)_ |

### 行为不变量 (闸 4 — ADM-2 4.1)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 4.1.a 每种 admin action 类型 → 自动写一行 admin_actions (单测覆盖每种 action; 反向: action 路径不写 audit → 该 endpoint 必须红测) | unit (table-driven) | 战马B / 烈马 | _(待填)_ |
| 4.1.b 受影响者必收 system message: admin 删 channel → target user 收到 "你的 channel #X 被 admin Y 于 Z 删除" (强制下发, 不依赖前端订阅) | E2E + unit | 烈马 | _(待填)_ |
| 4.1.c 分层可见: user A 调 `/api/v1/me/admin-actions` **只**返回 target_user_id == A 的行 (反向: 调入 user B 的 id → 401/403 或空, 不泄漏跨 org) | unit | 烈马 | _(待填)_ |
| 4.1.d admin 之间互相可见: admin X 调 `/admin-api/v1/audit-log` 返回**全部** admin_actions 行 (含 admin Y 的操作); user cookie 调同 endpoint → 401 (REG-ADM0-002 同款轨道隔离 fail-closed) | unit | 烈马 | _(待填)_ |

### 蓝图行为对照 (闸 2)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| §1.4 红线 3 "admin 之间互相留痕": `grep -rE 'admin_actions.*INSERT\|adminActions\.create' internal/admin/` 覆盖 admin SPA 所有写路径 (反向: action 不写 audit → CI grep block) | CI grep + handler 反射 | 飞马 / 烈马 | _(待填)_ |

### 退出条件

- 上表 7 项**全绿** (一票否决式: 任何 4.1.x 红 → 不签字)
- 战马B 引用 review 同意 + 烈马 acceptance 跑完
- 登记 `docs/qa/regression-registry.md` REG-ADM2-001..007 (PR merge 后 24h 内翻 ⚪ → 🟢)
- ⚠️ 不进野马 G2.4 签字流 (R2 取消 ⭐), 但 ADM-1 隐私承诺页 "你能在设置看到 admin 影响记录" 文案兑现, 由烈马代签
