import { WebSocket } from 'ws';

export function connectWS(port: number, path: string, query?: Record<string, string>): Promise<WebSocket> {
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}${qs}`);
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
