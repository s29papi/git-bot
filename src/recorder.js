import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import WebSocket from 'ws';

async function listPageTargets(endpoint) {
  const base = new URL(endpoint);
  base.pathname = '/json/list';
  base.search = '';
  const response = await fetch(base);
  if (!response.ok) throw new Error(`Chrome DevTools returned HTTP ${response.status}`);
  const targets = await response.json();
  const pages = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (!pages.length) throw new Error('No Chrome page target found at the CDP endpoint');
  return pages;
}

const socketState = new WeakMap();

function sendCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const state = socketState.get(ws);
    const id = state.nextId++;
    const timeout = setTimeout(() => {
      state.pending.delete(id);
      reject(new Error(`Chrome DevTools command timed out: ${method}`));
    }, 10_000);

    state.pending.set(id, { resolve, reject, timeout });
    ws.send(JSON.stringify({ id, method, params }), (error) => {
      if (error) {
        clearTimeout(timeout);
        state.pending.delete(id);
        reject(error);
      }
    });
  });
}

function connectPage(webSocketDebuggerUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketDebuggerUrl);
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error('Timed out connecting to Chrome page target'));
    }, 10_000);

    ws.once('open', () => {
      clearTimeout(timeout);
      socketState.set(ws, { nextId: 1, pending: new Map() });
      ws.on('message', (raw) => {
        let message;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          return;
        }
        const command = socketState.get(ws).pending.get(message.id);
        if (!command) return;
        clearTimeout(command.timeout);
        socketState.get(ws).pending.delete(message.id);
        if (message.error) command.reject(new Error(message.error.message));
        else command.resolve(message.result);
      });
      resolve(ws);
    });
    ws.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export async function startRecorder({ cdpEndpoint, framesDir, fps, url, targetText }) {
  const pages = await listPageTargets(cdpEndpoint);
  const page = pages.find((target) => target.url === 'about:blank') ?? pages[0];
  const ws = await connectPage(page.webSocketDebuggerUrl);
  await sendCommand(ws, 'Page.enable');
  await sendCommand(ws, 'Page.navigate', { url });

  const readyDeadline = Date.now() + 30_000;
  let pageReady = false;
  while (Date.now() < readyDeadline) {
    try {
      const result = await sendCommand(ws, 'Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true,
      });
      if (result.result?.value === 'complete') {
        pageReady = true;
        break;
      }
    } catch {
      // Navigation can replace the execution context; retry after it settles.
    }
    await sleep(100);
  }
  if (!pageReady) {
    ws.close();
    throw new Error(`Timed out loading ${url} before recording`);
  }
  await sleep(500);
  console.log(`Loaded ${url}; starting recording`);

  let stopped = false;
  let frameCount = 0;
  const frameTimes = [];
  const targetBoxes = [];
  const captureStartedAt = Date.now();
  let captureError;
  const intervalMs = Math.round(1000 / fps);

  const captureLoop = (async () => {
    while (!stopped) {
      const startedAt = Date.now();
      try {
        let targetBox = null;
        if (targetText) {
          const expression = `(() => {
            const needle = ${JSON.stringify(targetText.toLowerCase())};
            const controls = [...document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')];
            const element = controls.find((candidate) => {
              const label = (candidate.innerText || candidate.value || candidate.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().toLowerCase();
              return label.includes(needle);
            });
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
          })()`;
          try {
            const response = await sendCommand(ws, 'Runtime.evaluate', { expression, returnByValue: true });
            targetBox = response.result?.value ?? null;
          } catch {
            // The app can replace its execution context while Kane navigates.
          }
        }
        const screenshot = await sendCommand(ws, 'Page.captureScreenshot', {
          format: 'jpeg',
          quality: 85,
          fromSurface: true,
          captureBeyondViewport: false,
        });
        frameCount += 1;
        const filename = `${String(frameCount).padStart(6, '0')}.jpg`;
        await fs.writeFile(path.join(framesDir, filename), Buffer.from(screenshot.data, 'base64'));
        frameTimes.push(Date.now() - captureStartedAt);
        targetBoxes.push(targetBox);
      } catch (error) {
        captureError = error;
        break;
      }
      await sleep(Math.max(0, intervalMs - (Date.now() - startedAt)));
    }
  })();

  return {
    startedAt: captureStartedAt,
    async stop() {
      stopped = true;
      await captureLoop;
      ws.close();
      if (captureError) throw captureError;
      if (frameCount === 0) throw new Error('Chrome did not produce any screenshots');
      return { frameCount, frameTimes, targetBoxes };
    },
  };
}
