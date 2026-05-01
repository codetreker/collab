# Acceptance Template — DEFERRED-UNWIND (test.fixme + test.skip + ⏸ unwind 5+ 处)

> Spec brief `deferred-unwind-spec.md` (飞马 v0). Owner: 战马C 实施 / 飞马 review / 烈马 验收.
>
> **DEFERRED-UNWIND 范围**: G4.audit closure P0 (a) 真漏件交叉核验 — test.fixme + test.skip 残留 5+ 处 (cv-4-iterate × 2 + g2.4-adm-0-stance + g2.4-demo-screenshots × 3 + cv-3-3-deferred = 7+) 应 unwind, 依赖 milestone (#409 / ADM-0 / CV-5) 全 land. 立场承袭"一次做干净不留尾"用户铁律 + REG ⏸ 32 行真应回收的 audit. **0 production code 改 (仅 test unwind + REG ⏸→🟢)**.

## 验收清单

### §1 行为不变量 (test.fixme + test.skip 全 unwind)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 1.1 cv-4-iterate.spec.ts 2 test.fixme unwind (`§3.3 待 #409` + `§4 G3.4 demo 4 截屏 待 #409`) — #409 已 merge ≥6 month | E2E | `cv-4-iterate.spec.ts` 2 test 真启 PASS |
| 1.2 g2.4-adm-0-stance.spec.ts test.skip unwind (`admin god-mode 看 channel 元数据但不能进入 + 红色横幅常驻`) — ADM-0 全 land | E2E | spec 真启 PASS |
| 1.3 g2.4-demo-screenshots.spec.ts 3 test.skip unwind 或 audit 真删 (`左栏 / Agent inbox / quick-action 错误态`) | E2E + audit | 各 case 真启 PASS 或 audit 真删 (历史 milestone 全 land) |
| 1.4 cv-3-3-deferred.spec.ts test.fixme unwind (`§3.1 code prism + mention preview e2e`) — CV-5 已 land (跟 P1.2 REG-CV3-005 ⏸ 同笔) | E2E | `cv-3-3-renderers.spec.ts` 真启 PASS + 2 截屏 g3.4-cv3-{code-go-highlight,image-embed}.png 真生成 |

### §2 反向断言 (CI step 反 fixme/skip 再积)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 2.1 CI step `e2e-fixme-skip-guard` 加 — 反向 grep `test\.fixme\|test\.skip` 在 packages/e2e/tests/ ≤2 (合规白名单, 跟 NAMING-1 反 spam 立场承袭) | CI yml | `release-gate.yml` step + CI run PASS |
| 2.2 REG ⏸ 32 行 audit + 真应回收的 ⏸→🟢 翻 (REG-CV3-005 + REG-BPP32-401 抽样验) | inspect | registry 翻牌 verify |

### §3 closure (REG + cov gate + 跨 milestone 锁)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 3.1 既有全包 unit + e2e + vitest 全绿不破 (unwind 后既有 e2e 全 PASS) + post-#621 haystack gate 三轨过 | full test + CI | go-test-cov SUCCESS |
| 3.2 0 production code 改 (仅 test unwind + 截屏 + REG 翻牌) | git diff | `git diff main -- packages/server-go/` 0 行 + `git diff main -- packages/client/` 0 行 |
| 3.3 立场承袭"一次做干净不留尾"用户铁律 + 跨四 milestone audit 反转锁链 (RT-3 + REFACTOR-2 + DL-3 + AP-2 v1) + post-#621 G4.audit closure pattern | inspect | spec §0 立场承袭 |

## REG-DEFUNW-* 占号 (initial ⚪)

- REG-DEFUNW-001 ⚪ cv-4-iterate.spec.ts 2 test.fixme unwind (#409 已 land)
- REG-DEFUNW-002 ⚪ g2.4-adm-0-stance.spec.ts test.skip unwind (ADM-0 全 land)
- REG-DEFUNW-003 ⚪ g2.4-demo-screenshots.spec.ts 3 test.skip unwind 或 audit 真删
- REG-DEFUNW-004 ⚪ cv-3-3-deferred.spec.ts test.fixme unwind + 2 截屏真生成 (REG-CV3-005 ⏸→🟢)
- REG-DEFUNW-005 ⚪ CI step `e2e-fixme-skip-guard` 反向 grep 守门 + REG ⏸ 32 行 audit
- REG-DEFUNW-006 ⚪ 全包 PASS + haystack gate + 0 production code 改 + 立场承袭"一次做干净不留尾"用户铁律

## 退出条件

- §1 (4) + §2 (2) + §3 (3) 全绿 — 一票否决
- ≥5 test.fixme/skip unwind + REG ⏸→🟢 抽样翻
- CI step `e2e-fixme-skip-guard` 守门
- 全包 PASS + 0 production code 改 + post-#621 haystack gate
- 登记 REG-DEFUNW-001..006

## 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-05-01 | 烈马 | v0 — acceptance template. 立场承袭 G4.audit closure P0 (a) 真漏件 + 跨四 milestone audit 反转锁链 + 用户铁律"一次做干净不留尾" + REG ⏸ 32 行 audit 回收. |
