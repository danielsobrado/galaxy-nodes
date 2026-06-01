import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(projectRoot, 'examples/next/out');
const mimeTypes = new Map([
  ['.css', 'text/css'],
  ['.html', 'text/html'],
  ['.js', 'text/javascript'],
  ['.json', 'application/json'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain'],
  ['.woff2', 'font/woff2'],
]);

function contentType(filePath) {
  return mimeTypes.get(path.extname(filePath)) ?? 'application/octet-stream';
}

function resolveRequest(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const candidate = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(outDir, candidate);
  if (!filePath.startsWith(outDir)) return null;
  return filePath;
}

const server = createServer(async (request, response) => {
  const filePath = resolveRequest(request.url ?? '/');
  if (!filePath) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, { 'content-type': contentType(filePath) }).end(body);
  } catch {
    try {
      const fallback = await readFile(path.join(outDir, '404.html'));
      response.writeHead(404, { 'content-type': 'text/html' }).end(fallback);
    } catch {
      response.writeHead(404).end('Not found');
    }
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Could not start static Next smoke server.');
const baseUrl = `http://127.0.0.1:${address.port}`;

let browser;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 960, height: 640 } });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('img', { name: 'Next.js server-rendered graph example' }).waitFor();
  await page.getByLabel('Graph data summary').waitFor();
  await page.locator('canvas, .scene-fallback').first().waitFor({ timeout: 30_000 });
  const hasCanvas = await page.locator('canvas').count();
  console.log(`Next runtime smoke OK: ${hasCanvas ? 'canvas' : 'fallback'} rendered.`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
