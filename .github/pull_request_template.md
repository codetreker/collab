## What

<!-- Describe the change in 1-3 sentences. Why, not what. -->

## Blueprint

<!--
Required (规则 4 + 闸 2 grep). Cite the blueprint module + section this PR
delivers. At least one line starting with `Blueprint:` AND containing `§`
MUST be present (not the heading above — a real line below).
Example:
  Blueprint: concept-model §1.1, §2
  Blueprint: plugin-protocol §1.6
-->

Blueprint: <module> §X.Y

## Touches

<!--
Required. Comma-separated subsystems this PR modifies. Pick from:
  server, client, plugin, helper, remote-agent, docs, ci

The CI lint greps for a line starting with `Touches:` (the line below the
heading), not the heading itself. Keep both.

If you list 2 OR MORE subsystems, you MUST split this PR into:
  1. an interface-contract PR (≤300 lines: schema / proto / API types)
  2. one or more implementation PRs

A single cross-system implementation PR is rejected by review even if CI passes.
-->

Touches: <subsystems>

## Current 同步

<!--
Required (规则 6). List the docs/current/<module>/*.md files updated in this PR.
If a code change genuinely needs no current update, write `N/A — <reason>`.
A CI lint blocks PRs that touch internal/<module>/ but never docs/current/<module>/.
-->

- docs/current/...

## Acceptance

<!--
Pick at least one of the four acceptance forms (see how-to-write-milestone.md):
  1. E2E 断言
  2. 蓝图行为对照
  3. 数据契约
  4. 行为不变量

For ⭐ standout milestones, BOTH 4.1 (single-form acceptance) AND 4.2
(野马 demo + 关键截屏) are required.
-->

- [ ] Form: <1 / 2 / 3 / 4>
- [ ] Evidence: <test name / SQL / grep output / screenshot path>

## Stage

<!--
v0 (allows breaking change) or v1 (forward-only). Today: v0.
Suffix allowed: v0.1, v1.0, v0 patch, v1.x — anything starting with
v0/v1 + word boundary passes the lint regex.
-->

Stage: v0
