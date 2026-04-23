import http from 'node:http';
import { WebSocket } from 'ws';

export interface ConnectWSOpts {
  headers?: Record<string, string>;
}

export function connectWS(port: number, path: string, queryOrOpts?: Record<string, string> | ConnectWSOpts): Promise<WebSocket> {
  let qs = '';
  let headers: Record<string, string> | undefined;

  if (queryOrOpts && 'headers' in queryOrOpts) {
    headers = queryOrOpts.headers;
  } else if (queryOrOpts) {
    qs = '?' + new URLSearchParams(queryOrOpts as Record<string, string>).toString();
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}${qs}`, { headers });
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error('WS connect timeout'));
    }, 5000);
    ws.on('open', () => {
      clearTimeout(timeout);
      resolve(ws);
    });
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export function connectPluginWS(port: number, apiKey: string): Promise<WebSocket> {
  return connectWS(port, '/ws/plugin', { headers: { authorization: `Bearer ${apiKey}` } });
}

export interface SSEEvent {
  event?: string;
  id?: string;
  data?: string;
  parsed?: any;
}

export function collectSSEEvents(
  port: number,
  apiKey: string,
  opts: { timeoutMs?: number; filter?: (ev: SSEEvent) => boolean; count?: number } = {},
): Promise<SSEEvent[]> {
  const { timeoutMs = 5000, filter, count } = opts;
  return new Promise((resolve, reject) => {
    const events: SSEEvent[] = [];
    const timer = setTimeout(() => {
      req.destroy();
      resolve(events);
    }, timeoutMs);

    const req = http.get(
      `http://127.0.0.1:${port}/api/v1/stream`,
      { headers: { authorization: `Bearer ${apiKey}` } },
      (res) => {
        let buf = '';
        res.on('data', (chunk: Buffer) => {
          buf += chunk.toString();
          const blocks = buf.split('\n\n');
          buf = blocks.pop()!;
          for (const block of blocks) {
            if (!block.trim()) continue;
            const ev: SSEEvent = {};
            for (const line of block.split('\n')) {
              if (line.startsWith('event:')) ev.event = line.slice(6).trim();
              else if (line.startsWith('id:')) ev.id = line.slice(3).trim();
              else if (line.startsWith('data:')) {
                ev.data = line.slice(5).trim();
                try { ev.parsed = JSON.parse(ev.data); } catch {}
              }
            }
            if (!filter || filter(ev)) {
              events.push(ev);
              if (count && events.length >= count) {
                clearTimeout(timer);
                res.destroy();
                resolve(events);
                return;
              }
            }
          }
        });
        res.on('error', () => {});
      },
    );
    req.on('error', (err) => {
      clearTimeout(timer);
      if (events.length > 0) resolve(events);
      else reject(err);
    });
  });
}

export async function connectAuthWS(port: number, cookie: string): Promise<WebSocket> {
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const sock = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie } });
    const timeout = setTimeout(() => {
      sock.terminate();
      reject(new Error('WS connect timeout'));
    }, 5000);
    sock.on('open', () => {
      clearTimeout(timeout);
      resolve(sock);
    });
    sock.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
  ws.send(JSON.stringify({ type: 'ping' }));
  await waitForMessage(ws, (m) => m.type === 'pong');
  return ws;
}

export async function subscribeToChannel(ws: WebSocket, channelId: string): Promise<void> {
  ws.send(JSON.stringify({ type: 'subscribe', channel_id: channelId }));
  await waitForMessage(ws, (m) => m.type === 'subscribed' && m.channel_id === channelId);
}

export function waitForMessage(
  ws: WebSocket,
  filter?: (msg: any) => boolean,
  timeoutMs = 5000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error('waitForMessage timeout'));
    }, timeoutMs);
    function handler(raw: Buffer | string) {
      const msg = JSON.parse(raw.toString());
      if (!filter || filter(msg)) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    }
    ws.on('message', handler);
  });
}

export function waitForClose(ws: WebSocket, timeoutMs = 5000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('waitForClose timeout')), timeoutMs);
    ws.on('close', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function closeWsAndWait(ws: import('ws').WebSocket): Promise<void> {
  if (ws.readyState === ws.CLOSED) return;
  ws.close();
  await waitForClose(ws).catch(() => {});
  await sleep(50);
}

export async function collectMessages(
  ws: WebSocket,
  timeoutMs: number,
): Promise<any[]> {
  const msgs: any[] = [];
  const handler = (raw: Buffer | string) => {
    msgs.push(JSON.parse(raw.toString()));
  };
  ws.on('message', handler);
  await sleep(timeoutMs);
  ws.removeListener('message', handler);
  return msgs;
}
