# Admin Model — 管理面与隐私契约

> Admin 是 Borgee 在产品模型外的运维身份。本文规范 admin 的目标态——尤其是它**能看什么不能看什么**这条隐私契约。
> 状态：建军 + 飞马 + 野马 对齐（2026-04-27）。前置阅读：[`concept-model.md`](concept-model.md)、[`auth-permissions.md`](auth-permissions.md)。

## 0. 一句话定义

> **Borgee admin 强权但不窥视——元数据可管、内容不可读、用户始终知道与自己相关的事。**

---

## 1. 目标态（Should-be）— 四条立场

### 1.1 Admin 形态：独立 SPA（B）

- Admin **不是** org 成员（[concept-model §2](concept-model.md) 已钉）——不是 user，不属于任何 org。
- 物理隔离的运维 SPA + 独立鉴权域（独立 cookie / 独立路由）。
- 这条把现状从"奇怪历史包袱"升级成"有意设计"——**身份模型干净**：
  - 产品代码不为 admin 写分支（admin 没有 agent、没有 channel、不在 user 表的 role 里走 product 流程）
  - 否则会引爆"admin 有没有自己的 agent / org / DM"等连锁矛盾

### 1.2 Admin 来源：C 混合

| 阶段 | 入口 |
|------|------|
| **首个 admin** | 环境变量 `ADMIN_USER` / `ADMIN_PASSWORD` bootstrap | 防空表自举漏洞，唯一启动入口 |
| **后续 admin** | 现有 admin 在 SPA 里 promote 已有 user | 走 audit log |

#### 数据模型

- `users.role = 'admin'` 标记
- `admin_grants(promoted_by, promoted_at, promoted_user_id)` 表记录每次提升

> 注意：被 promote 的 user **不再是该 org 的成员**——他成为 admin 即从 org 模型中"出列"。这条隐含规则需在 promote 时显式确认（"提升 X 为 admin 将让他失去 org 成员身份")。

### 1.3 边界：硬隔离 + 内容必须用户授权

#### Admin **可看**（元数据层）

- ✅ 用户列表（含禁用/删除状态）
- ✅ Channel **元数据**：id、名、成员列表、创建时间、消息计数
- ✅ 统计：在线数、活跃数、容量等
- ✅ API key 状态（是否存在、最后使用时间，**不是 key 本身**）
- ✅ Agent 数 / runtime 状态

#### Admin **不可看**（内容层）

- ❌ 任何 channel 的消息内容
- ❌ 任何 DM 的内容（**包括 owner-agent 内置 DM**）
- ❌ artifact 内容
- ❌ 用户上传的文件内容

#### Admin **可做**（合法运维动作）

- ✅ Force delete channel
- ✅ 重置 user API key
- ✅ 改 user 密码（user 下次登录被强制）
- ✅ Disable / enable user
- ✅ Soft delete user（[server §existing](server/data-model.md)）

#### Impersonate（保留，但严格）

- **不**默认开启
- 用户在设置面**主动**勾选"允许 support 调试 24h"
- 仅限 24h 时窗，到期自动失效
- 范围：**只读实时入站，不读历史 DM，不能代发消息**
- 用户可随时撤销

#### 核心契约

> **"管控元数据 = OK，读内容 = 必须用户主动授权"**

这条边界跟 [host-bridge §1.3](host-bridge.md) 的"装时轻、用时问、问时有理由"同范式——Borgee 默认信任用户的隐私。

### 1.4 可见性：分层透明（A + C 组合）

> 实质方案：**100% 留痕** + **按受众分层**——既杜绝 admin 滥用，又不在跨 org 场景泄漏隐私。

#### 谁能看到什么

| 谁 | 能看到 |
|----|--------|
| **受影响者** | 必收 system message：例如"你的 channel #foo 被 admin 张三于 X 时间删除"。强制下发，不可关闭。 |
| **被 impersonate 用户** | 顶部**红色横幅**："support 张三正在协助你，剩 23h"。横幅常驻直到结束。 |
| **admin 之间** | 全部 audit log 互相可见——防内部滥用 |
| **普通 user** | 只能看到**与自己相关的** audit 条目（我的 channel 被删 / 我被封 / 我被 impersonate） |
| **没人能看** | 全站 audit log **不对全体 user 公开**——避免跨 org 隐私泄漏 |

#### 为什么不是"全员透明"

- 字面执行 = 野马 org 的 channel 被删，建军 org 的所有 user 都看到 → 跨 org 隐私破壞
- "用户始终知道与自己相关的事" 是契约，不是"所有人知道所有人发生了什么"

#### 三条用户感知的红线（不可让步）

1. ✅ 受影响者**必收**通知（不能静默）
2. ✅ Impersonate **必须显眼**（红色横幅 + 倒计时）
3. ✅ Admin 之间**互相留痕**（防 admin 互相包庇）

---

## 2. 关键不变量

| 不变量 | 含义 |
|--------|------|
| Admin ∉ Org | admin 永远不是任何 org 的成员，也不出现在 channel members |
| Admin 默认看不到内容 | 必须用户主动 grant impersonate 才能"看进去" |
| 受影响者**必感知** admin 操作 | 系统强制下发 system message，不能关闭 |
| Audit 100% 留痕 | admin 一切操作进 audit_log |
| Audit 分层可见 | admin 之间全可见，user 只见与己相关，全站不公开 |

---

## 3. 数据模型片段

```
admin_grants:
  id, promoted_user_id, promoted_by, promoted_at

admin_audit:
  id, admin_id, action, target_type, target_id,
  metadata (JSON), created_at

impersonation_grants:
  id, user_id, granted_at, expires_at, revoked_at
  -- 由 user 创建（设置面勾选）；admin 仅消费这条记录
```

## 4. 与现状的差距

| 目标态 | 现状 | 差距 |
|--------|------|------|
| 独立 SPA + 独立 cookie | ✅ 已有 | 把它从"奇怪"改为"有意设计"——文档更新，代码不动 |
| Admin promote 链 | 当前只 env，无 promote | 加 `admin_grants` 表 + SPA promote 流程 + audit 集成 |
| 硬隔离内容访问 | admin force delete 不读内容，但 API 层无显式限制 | server 加 admin 白名单 endpoint，明确**禁止** admin 调任何"读内容"的 user-facing API |
| Impersonate 主动授权 | 不存在 | 设置面开关 + `impersonation_grants` 表 + 24h 过期机制 + 顶部红色横幅 UX |
| 受影响者 system message | force delete 已有通知 | 扩展到所有 admin 写动作（封禁、重置、改密码等） |
| Audit log + 分层可见 | 无 audit | 新建 `admin_audit` 表 + admin SPA 列表 + per-user 自助查询 |

---

## 5. 不在本轮范围

- Admin SPA 的具体页面 UI → 第 11 轮"Client (web SPA)"
- 多 admin 协作流程（互相 promote / demote） → v2
- Audit log 的导出 / 合规对接（GDPR delete request 等） → v2+
- Impersonate 期间的 BPP 行为（agent 端是否知道被 impersonate） → 第 5 轮已确定 BPP 不直接暴露此概念，agent 行为不变
