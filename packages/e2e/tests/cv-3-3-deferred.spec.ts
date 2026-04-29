// tests/cv-3-3-deferred.spec.ts — CV-3.3 deferred-coverage tracking spec.
//
// Purpose: pin the **deferred** subset of cv-3.md acceptance §3 +
// §3.4 demo screenshot list as test.fixme stubs so they don't silently
// pass. Each fixme carries an explicit `CV-5+ list endpoint` TODO so a
// reverse grep on this file shows the exact gap to close once the list
// surface lands.
//
// Background (跟 PR #408 cv-3-3-renderers.spec.ts 同模块):
//
//   ArtifactPanel v1 没有 list endpoint (CV-1.3 #346 spec §3 字面 +
//   server `/artifacts.go` only registers POST /channels/:id/artifacts +
//   GET /artifacts/:id (single by id) — no GET /channels/:id/artifacts
//   collection). Panel 仅渲染 user UI session 创的 artifact (handleCreate
//   line 199 → setArtifact). Code/image_link kind 走 REST 直接创但 panel
//   不渲染, e2e 走 UI gotoCanvasTab → click "create" 仅触 markdown 路径
//   (default type='markdown', CV-3.2 #400 server validation 兼容旧 client).
//
//   Consequence — 3 acceptance items + 2 demo screenshots **不可触**
//   without the CV-5+ list endpoint:
//     §3.1 code artifact (Go) prism syntax highlight class hit e2e
//     §3.3 mention preview kind 三模式 (markdown/code/image 流内缩略)
//     §3.4 g3.4-cv3-code-go-highlight.png demo screenshot
//     §3.4 g3.4-cv3-image-embed.png demo screenshot
//
//   PR #408 (zhanma-d) covered §3.2 (image_link URL reject REST 反断)
//   + §3.4 g3.4-cv3-markdown.png baseline. The 4 deferred items above
//   were silently absent — 跟 cv-3.md acceptance §3 字面对齐失衡, 落
//   "implicit PASS" 风险 (CI 跑 0 hit ≠ "已闭", 是"没测").
//
//   Fix path: this file makes the gap **explicit** via test.fixme. A
//   reverse grep `grep -nE 'CV-5\+' packages/e2e/tests/` 命中此文件
//   ≥4 hit, 跟 cv-3.md §3.1/§3.3/§3.4 留账行 byte-identical 对账.
//
// Closure path (CV-5+ list endpoint 落地后):
//   1. Add GET /api/v1/channels/:channelId/artifacts (list) — 蓝图
//      §1.4 "artifact 集合" 字面兑现.
//   2. ArtifactPanel: list view → click row → setArtifact(row).
//   3. Convert each test.fixme below to test() — body 已写好 stub,
//      只需切真路径 + screenshot path-locked.
//   4. cv-3.md acceptance §3.1/§3.3/§3.4 实施证据列填本 spec 对应
//      test 函数名 + commit hash; reg-flip patch (跟 #421 CV-2 同模式)
//      flip ⚪→🟢.
//
// 反约束遵守 (#338 cross-grep + 沉默胜于假 loading §11):
//   - 不引入新 client 路径 / 新 server endpoint (本文件 0 packages/* 改)
//   - 不假装通过 — 4 fixme 全 explicit + TODO("CV-5+ list endpoint")
//     comment 锚 byte-identical 跟 docs/qa/acceptance-templates/cv-3.md §3
//     字面对齐 (改 = 改两边)
//   - 不删 PR #408 既有 §3.2 + §3.4 markdown 截屏 (留账互补, 不重叠)

import { test, expect } from '@playwright/test';

test.describe('CV-3.3 deferred coverage — CV-5+ list endpoint 留账', () => {
  // §3.1 code artifact prism syntax highlight e2e — deferred:
  // ArtifactPanel can only render artifacts whose ID is set via
  // handleCreate (UI default type='markdown'); no GET list to pick up
  // a code-kind artifact created via REST. Re-enable once CV-5+ list
  // endpoint lands and panel exposes a row-click selector.
  //
  // TODO: CV-5+ list endpoint
  test.fixme('§3.1 code artifact (Go) prism syntax highlight class hit', async () => {
    // Placeholder body — closure path:
    //   1. createArtifact via REST: type='code', metadata.language='go',
    //      body=<go source>
    //   2. List via new GET /channels/:id/artifacts
    //   3. Click the code row in the panel list view
    //   4. expect(.prism-token / .prism-code) toBeVisible
    //   5. expect(.code-lang-badge[data-lang="go"]) toBeVisible (lock
    //      跟 #370 §1 ② 11 项白名单 byte-identical)
    expect(true, 'CV-5+ list endpoint required to render code-kind artifact in ArtifactPanel').toBe(true);
  });

  // §3.3 mention preview kind 三模式 e2e — deferred: same root cause
  // (no list endpoint to enumerate the 3 kinds, mention `<artifact:id>`
  // token preview pulls via GET /artifacts/:id which works, but creating
  // 3 artifact kinds for the mention round-trip requires the list view
  // to verify they exist + selectable in UI).
  //
  // TODO: CV-5+ list endpoint
  test.fixme('§3.3 mention preview kind 三模式 (markdown 80字 / code 5行 / image 192px)', async () => {
    // Placeholder body — closure path:
    //   1. createArtifact 3 kinds (markdown / code / image_link) via REST
    //   2. Send a channel message body with `<artifact:{id}>` token for each
    //   3. Render message stream → expect each preview kind:
    //      - markdown: head 80 chars + ellipsis '…'
    //      - code:     head 5 lines + lang badge (跟 §3.1 byte-identical)
    //      - image:    <img loading="lazy" style="max-width: 192px">
    //   4. DOM lock <span class="artifact-preview" data-artifact-kind="{kind}">
    //      包裹 (跟 #370 §1 ⑥ byte-identical)
    expect(true, 'CV-5+ list endpoint required to enumerate 3 kinds for mention preview round-trip').toBe(true);
  });

  // §3.4 G3.4 demo screenshots — 2/3 deferred (markdown baseline 已由
  // PR #408 cv-3-3-renderers.spec.ts §3.4 出, code + image 截屏待 list
  // endpoint 后切真路径). 此 fixme 占位 explicit 反查锚 — closure 时
  // 切到 page.screenshot() with locked path.
  //
  // TODO: CV-5+ list endpoint
  test.fixme('§3.4 G3.4 demo screenshot — code (Go highlight)', async () => {
    // Placeholder body — closure path:
    //   1. (Pre-req §3.1 closure) — code-kind artifact rendered in panel
    //   2. await page.screenshot({
    //        path: path.join(SCREENSHOT_DIR, 'g3.4-cv3-code-go-highlight.png'),
    //        fullPage: false,
    //      });
    //   3. acceptance §3.4 字面 byte-identical 锚 (跟 PR #408 markdown
    //      baseline 出的 g3.4-cv3-markdown.png 同目录, 命名规则 byte-identical
    //      跟 acceptance line 47 字面 'g3.4-cv3-{markdown,code-go-highlight,image-embed}.png')
    expect(true, 'CV-5+ list endpoint required for code artifact panel render').toBe(true);
  });

  // TODO: CV-5+ list endpoint
  test.fixme('§3.4 G3.4 demo screenshot — image_link (https embed)', async () => {
    // Placeholder body — closure path:
    //   1. (Pre-req §3.1 / new image_link UI path) — image_link artifact
    //      rendered in panel (<img loading="lazy" src="https://...">)
    //   2. await page.screenshot({
    //        path: path.join(SCREENSHOT_DIR, 'g3.4-cv3-image-embed.png'),
    //        fullPage: false,
    //      });
    //   3. acceptance §3.4 字面 byte-identical 锚 (g3.4-cv3-image-embed.png)
    //   4. 反约束: src 必 https (XSS 红线第一道 #370 §1 ④ 同源, ValidateImageLinkURL
    //      已 server 端守, e2e 截屏路径 byte-identical 锚)
    expect(true, 'CV-5+ list endpoint required for image_link artifact panel render').toBe(true);
  });
});
