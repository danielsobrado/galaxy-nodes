import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const port = 4179;
const baseUrl = `http://127.0.0.1:${port}`;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    async function poll() {
      try {
        const response = await fetch(url);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // Keep polling until timeout.
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }

      setTimeout(poll, 500);
    }

    void poll();
  });
}

const server = spawn('npx', ['next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: path.join(projectRoot, 'examples/next'),
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
});

let browser;

try {
  await waitForServer(baseUrl);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 960, height: 640 } });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('img', { name: 'Next.js server-rendered graph example' }).waitFor();
  await page.getByLabel('Graph data summary').waitFor();
  await page.locator('canvas, .scene-fallback').first().waitFor({ timeout: 30_000 });
  const hasCanvas = await page.locator('canvas').count();
  const hasFallback = await page.locator('.scene-fallback').count();
  if (!hasCanvas && !hasFallback) throw new Error('Expected hydrated graph canvas or WebGL fallback.');
  console.log(`Next runtime smoke OK: ${hasCanvas ? 'canvas' : 'fallback'} rendered.`);
} finally {
  await browser?.close();
  server.kill();
}
