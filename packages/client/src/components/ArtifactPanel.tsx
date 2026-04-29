// ArtifactPanel — CV-1.3 client SPA canvas UI (#342 server / #334 schema).
//
// Blueprint: docs/blueprint/canvas-vision.md §0 (channel 围 artifact 协作)
// + §1.1-§1.6 (D-lite + workspace per channel + Markdown ONLY v1).
// Spec: docs/implementation/modules/cv-1-spec.md §3 (CV-1.3 段).
// Acceptance: docs/qa/acceptance-templates/cv-1.md §3.1-§3.3.
// Stance: docs/qa/cv-1-stance-checklist.md (v0, 7 立场) +
// docs/qa/cv-1-stance-v1-supplement.md (②③⑤⑦ v1 字段).
//
// 立场反查:
//   - ① 归属 = channel — 列表只显示当前 channel 的 artifacts; 没有 author owner.
//   - ② 单文档锁 30s TTL — 编辑提交收 409 → toast 字面 "内容已更新, 请刷新查看".
//   - ③ 版本线性 — sidebar 列表升序 version, 不删中间版本; rollback 也是新增 row.
//   - ④ Markdown ONLY — 永远渲染 marked + DOMPurify, 不接受 type 切换 (v1).
//   - ⑤ Frame 仅信号 — WS artifact_updated 收到后必须 GET /api/v1/artifacts/:id
//     才能拿 body / committer (envelope 不带 body); client 不能用 updated_at 排序.
//   - ⑥ committer_kind 'agent'|'human' — version row 渲染人/agent 标签 (head from GET).
//   - ⑦ rollback owner-only — 仅 channel.created_by 看到 "回滚" 按钮; 非 owner DOM
//     不渲染该按钮.
//
// 反约束 (本组件强制 grep 锚):
//   - 不上 CRDT (no yjs / no automerge — pure REST + WS signal)
//   - 不自造 envelope (使用 useArtifactUpdated hook, 走 #342 frame)
//   - 不用 client timestamp 排序 (列表按 version asc, RT-1 ① 反约束)
//   - rollback 不是 PATCH body 字段 (调 rollbackArtifact action endpoint)

import { useCallback, useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useToast } from './Toast';
import { useArtifactUpdated } from '../hooks/useWsHubFrames';
import { renderMarkdown } from '../lib/markdown';
import CodeRenderer from './CodeRenderer';
import ImageLinkRenderer from './ImageLinkRenderer';
import {
  ApiError,
  type Artifact,
  type ArtifactKind,
  type ArtifactVersion,
  commitArtifact,
  createArtifact,
  getArtifact,
  listArtifactVersions,
  rollbackArtifact,
} from '../lib/api';

interface Props {
  channelId: string;
}

// Conflict toast 文案锁 (acceptance §3.3 byte-identical) — 任何 commit
// 路径 409 都走这条; 其它 409 (e.g. 锁持有=别人) 也复用同文案保持一致.
const CONFLICT_TOAST = '内容已更新, 请刷新查看';

export default function ArtifactPanel({ channelId }: Props) {
  const { state } = useAppContext();
  const { showToast } = useToast();
  const currentUser = state.currentUser;
  const channel = state.channels.find((c) => c.id === channelId);
  // 立场 ⑦: rollback owner = channel.created_by (channel-model §1.4).
  const isOwner = !!currentUser && channel?.created_by === currentUser.id;

  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Reload artifact + version list. Triggered by initial mount,
  // channel switch, and WS artifact_updated push (立场 ⑤ pull-after-signal).
  const reload = useCallback(
    async (artifactId: string) => {
      try {
        const [head, list] = await Promise.all([
          getArtifact(artifactId),
          listArtifactVersions(artifactId),
        ]);
        setArtifact(head);
        setVersions(list.versions);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setArtifact(null);
          setVersions([]);
        }
      }
    },
    [],
  );

  // Reset on channel switch + try to find the channel's existing artifact.
  // CV-1.3 v1: one artifact per channel surface — listing API is out of
  // scope for this PR, so we lazy-create on first interaction. Until the
  // user creates one we render the "create" affordance.
  useEffect(() => {
    setArtifact(null);
    setVersions([]);
    setEditing(false);
    setEditBody('');
    setErrMsg(null);
  }, [channelId]);

  // 立场 ⑤ — WS push: re-fetch on signal frame for our artifact.
  // The handler closes over the latest artifact.id via useCallback +
  // a stable identity check inside.
  const onArtifactUpdated = useCallback(
    (frame: { artifact_id: string; channel_id: string }) => {
      if (frame.channel_id !== channelId) return;
      if (!artifact || frame.artifact_id !== artifact.id) return;
      void reload(artifact.id);
    },
    [channelId, artifact, reload],
  );
  useArtifactUpdated(onArtifactUpdated);

  const handleCreate = async () => {
    const title = window.prompt('Artifact 标题:', '未命名 artifact');
    if (!title || !title.trim()) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const created = await createArtifact(channelId, { title: title.trim(), body: '' });
      setArtifact(created);
      const list = await listArtifactVersions(created.id);
      setVersions(list.versions);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const handleStartEdit = () => {
    if (!artifact) return;
    setEditBody(artifact.body);
    setEditing(true);
    setErrMsg(null);
  };

  const handleSubmit = async () => {
    if (!artifact) return;
    setBusy(true);
    setErrMsg(null);
    try {
      await commitArtifact(artifact.id, {
        expected_version: artifact.current_version,
        body: editBody,
      });
      // Re-fetch authoritative head + version list.
      await reload(artifact.id);
      setEditing(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // 立场 ② lock conflict / version mismatch — toast 文案锁.
        showToast(CONFLICT_TOAST);
        // Re-fetch so the editor's expected_version moves forward.
        await reload(artifact.id);
      } else {
        setErrMsg(err instanceof Error ? err.message : '提交失败');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRollback = async (toVersion: number) => {
    if (!artifact) return;
    if (!isOwner) return; // defense in depth — server enforces too
    if (!window.confirm(`确认回滚到 v${toVersion}? 旧版本不会删除, 会新建一条 rollback 记录.`)) return;
    setBusy(true);
    setErrMsg(null);
    try {
      await rollbackArtifact(artifact.id, toVersion);
      await reload(artifact.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        showToast(CONFLICT_TOAST);
        await reload(artifact.id);
      } else {
        setErrMsg(err instanceof Error ? err.message : '回滚失败');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!artifact) {
    return (
      <div className="artifact-panel">
        <div className="artifact-empty">
          <p>该频道还没有 artifact</p>
          <button className="btn btn-primary" disabled={busy} onClick={handleCreate}>
            {busy ? '创建中…' : '新建 Markdown artifact'}
          </button>
          {errMsg && <p className="artifact-err">{errMsg}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="artifact-panel" data-artifact-kind={normalizeKind(artifact.type)}>
      <div className="artifact-header">
        <div className="artifact-title-row">
          <h3 className="artifact-title">{artifact.title}</h3>
          <span className="artifact-version-tag">v{artifact.current_version}</span>
        </div>
        {!editing && (
          <button className="btn btn-sm" disabled={busy} onClick={handleStartEdit}>
            编辑
          </button>
        )}
      </div>

      <div className="artifact-body-area">
        {editing ? (
          <div className="artifact-edit">
            <textarea
              className="artifact-textarea"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={20}
              spellCheck={false}
            />
            <div className="artifact-edit-actions">
              <button className="btn btn-primary" disabled={busy} onClick={handleSubmit}>
                {busy ? '提交中…' : '提交'}
              </button>
              <button className="btn" disabled={busy} onClick={() => setEditing(false)}>
                取消
              </button>
            </div>
            {errMsg && <p className="artifact-err">{errMsg}</p>}
          </div>
        ) : (
          <ArtifactBody artifact={artifact} />
        )}
        {errMsg && !editing && <p className="artifact-err">{errMsg}</p>}
      </div>

      <aside className="artifact-versions">
        <h4>版本</h4>
        <ul className="artifact-version-list">
          {versions.map((v) => {
            const isHead = v.version === artifact.current_version;
            const label =
              v.rolled_back_from_version != null
                ? `v${v.version} (rollback from v${v.rolled_back_from_version})`
                : `v${v.version}`;
            const kindBadge = v.committer_kind === 'agent' ? '🤖' : '👤';
            // 立场 ⑦ owner-only rollback button: 非 owner DOM 不渲染.
            // 当前 head 不需要回滚按钮 (回滚到自己).
            const showRollbackBtn = isOwner && !isHead && !editing;
            return (
              <li key={v.version} className={isHead ? 'artifact-version-row head' : 'artifact-version-row'}>
                <span className="artifact-version-label">{label}</span>
                <span className="artifact-version-kind" title={v.committer_kind}>
                  {kindBadge}
                </span>
                {showRollbackBtn && (
                  <button
                    className="btn btn-sm artifact-rollback-btn"
                    disabled={busy}
                    onClick={() => handleRollback(v.version)}
                  >
                    回滚到此版本
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}

/**
 * normalizeKind — 三 enum 收口 (markdown / code / image_link). 旧/未来
 * kind (v2+ 蓝图 §2 不做清单留账) 走 fallback path 在 ArtifactBody 里
 * 渲染 `<div class="artifact-kind-unsupported">` 兜底文案.
 *
 * 三 enum byte-identical 跟 cv-3-content-lock.md §1 ① +
 * cv_3_2_artifact_validation.go ArtifactKind* 同源.
 */
export function normalizeKind(raw: string | undefined): ArtifactKind | string {
  if (raw === 'markdown' || raw === 'code' || raw === 'image_link') {
    return raw;
  }
  return raw ?? 'markdown';
}

/**
 * ArtifactBody — kind switch 三分支 (CV-3.3 §2.1 acceptance).
 * Switch 顺序 markdown → code → image_link byte-identical 跟
 * content-lock §1 ① 同源.
 *
 * 反约束: 不渲染 raw HTML (XSS 红线 §2.8) — markdown 路径走
 * renderMarkdown() (marked + DOMPurify), 其它两 kind 走 React 节点.
 */
function ArtifactBody({ artifact }: { artifact: Artifact }) {
  const kind = normalizeKind(artifact.type);
  switch (kind) {
    case 'markdown':
      return (
        <div
          data-artifact-kind="markdown"
          className="artifact-rendered markdown-content"
          // 立场 ④ Markdown ONLY — renderMarkdown() 走 marked + DOMPurify,
          // 不接受 HTML 直插. 仅 markdown 分支保留 dangerouslySetInnerHTML.
          dangerouslySetInnerHTML={{ __html: renderMarkdown(artifact.body) }}
        />
      );
    case 'code':
      // language 在当前 PR 协议: server validation 已收 metadata.language
      // 但不持久化 (CV-3.2 留账); client 默认走 'text' fallback,
      // mention preview 路径有显式 language 时按值走.
      return (
        <div data-artifact-kind="code" className="artifact-rendered">
          <CodeRenderer body={artifact.body} />
        </div>
      );
    case 'image_link':
      // body = https URL (server ValidateImageLinkURL 已闸).
      // sub-kind 默认 image; v0 不暴露 link 切换 (留 metadata 持久化后).
      return (
        <div data-artifact-kind="image_link" className="artifact-rendered">
          <ImageLinkRenderer body={artifact.body} title={artifact.title} subKind="image" />
        </div>
      );
    default:
      // 立场 ⑦ — 兜底文案 (content-lock §1 ⑦ byte-identical).
      // 不 throw, 不 fallback markdown — 优雅降级展示原 kind 字串.
      return (
        <div className="artifact-kind-unsupported">
          此 artifact 类型 ({kind}) 暂不支持渲染
        </div>
      );
  }
}
