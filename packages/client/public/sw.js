const CACHE = 'borgee-v1';
const SHELL = ['/', '/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});

// DL-4 Web Push handler — receive encrypted payload from server (via
// VAPID gateway) + render notification. Payload shape per
// internal/push/mention_notifier.go (字面 byte-identical):
//   mention:    {kind:"mention",    from, channel, body, ts}
//   agent_task: {kind:"agent_task", agent_id, state, subject, reason, ts}
//
// 蓝图 client-shape.md L37: "@你, agent 完成长任务 — AI 团队异步协作的核心
// UX". 立场 (DL-4 spec §0): browser SW handles visibility-based dedup —
// focused tab suppresses notification.
self.addEventListener('push', (e) => {
  if (!e.data) return;
  let payload;
  try {
    payload = e.data.json();
  } catch {
    return;
  }

  let title = 'Borgee';
  let body = '';
  if (payload.kind === 'mention') {
    title = `${payload.from || 'Someone'} mentioned you in #${payload.channel || 'channel'}`;
    body = payload.body || '';
  } else if (payload.kind === 'agent_task') {
    if (payload.state === 'busy') {
      // 蓝图 §1.1 ⭐ subject 必带非空 (server-side validator 已守 fail-closed)
      title = 'Agent is working';
      body = payload.subject || '';
    } else {
      title = 'Agent finished';
      body = payload.reason ? `(${payload.reason})` : 'idle';
    }
  } else {
    return; // unknown payload kind — drop silently
  }

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.svg',
      badge: '/favicon.svg',
      tag: payload.kind, // collapse same-kind notifications
      data: payload,
    }),
  );
});

// Click handler — focus an existing SPA tab if one is open, else open
// a new one to /. Browsers fire one click event per notification.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })(),
  );
});
