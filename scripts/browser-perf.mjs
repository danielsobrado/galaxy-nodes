/* global Image, document, window */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = path.join(projectRoot, 'temp/browser-perf');

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;

    const raw = arg.slice(2);
    const equalsIndex = raw.indexOf('=');
    if (equalsIndex !== -1) {
      args.set(raw.slice(0, equalsIndex), raw.slice(equalsIndex + 1));
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(raw, next);
      index += 1;
    } else {
      args.set(raw, 'true');
    }
  }

  const sizes = String(args.get('sizes') ?? '10000,100000')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite);
  if (!sizes.length || sizes.some((size) => !Number.isInteger(size) || size <= 0)) {
    throw new Error('sizes must include at least one positive integer.');
  }

  return {
    json: args.get('json') === 'true',
    sizes,
  };
}

async function prepareApp() {
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(tempRoot, { recursive: true });
  await writeFile(
    path.join(tempRoot, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"><title>Galaxy Nodes Perf</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>\n',
  );
  await mkdir(path.join(tempRoot, 'src'), { recursive: true });
  await writeFile(
    path.join(tempRoot, 'src/main.jsx'),
    `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { GalaxyGraphVisualizer } from 'galaxy-nodes';
import { generateGalaxyDataset } from 'galaxy-nodes/presets/initiatives/core';
import 'galaxy-nodes/styles.css';

const size = Number(new URLSearchParams(location.search).get('size') ?? '10000');
const dataset = generateGalaxyDataset(size);
document.documentElement.style.background = '#050608';
document.body.style.margin = '0';
document.body.style.width = '100vw';
document.body.style.height = '100vh';
document.getElementById('root').style.width = '100vw';
document.getElementById('root').style.height = '100vh';

let frames = 0;
let totalDelta = 0;
let maxDelta = 0;
let lastFrame = performance.now();
function tick(now) {
  const delta = now - lastFrame;
  lastFrame = now;
  if (frames > 4) {
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
  }
  frames += 1;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

createRoot(document.getElementById('root')).render(
  <GalaxyGraphVisualizer dataset={dataset} options={{ motionPreference: 'full' }} />,
);

window.__galaxyPerf = {
  dataset,
  sample() {
    const measuredFrames = Math.max(1, frames - 5);
    const averageFrameMs = totalDelta / measuredFrames;
    return {
      averageFrameMs,
      edges: dataset.edges.length,
      fps: 1000 / averageFrameMs,
      frames: measuredFrames,
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
      maxFrameMs: maxDelta,
      nodes: dataset.nodes.length,
    };
  },
};
`,
  );
}

async function readCanvasSignal(page) {
  const screenshotBase64 = await page.screenshot({ encoding: 'base64', fullPage: false });
  return page.evaluate(async (base64) => {
    const probe = document.createElement('canvas');
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    probe.width = Math.min(320, image.naturalWidth);
    probe.height = Math.min(180, image.naturalHeight);
    const context = probe.getContext('2d');
    if (!context) return { nonBackgroundRatio: 0 };
    context.drawImage(image, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let lit = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 44) lit += 1;
    }
    return { nonBackgroundRatio: lit / (probe.width * probe.height) };
  }, screenshotBase64);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  await prepareApp();

  const server = await createServer({
    root: tempRoot,
    server: { host: '127.0.0.1', port: 0 },
    resolve: {
      alias: [
        { find: /^galaxy-nodes$/, replacement: path.join(projectRoot, 'src/index.ts') },
        {
          find: /^galaxy-nodes\/presets\/initiatives\/core$/,
          replacement: path.join(projectRoot, 'src/presets/initiatives/core.ts'),
        },
        { find: /^galaxy-nodes\/styles.css$/, replacement: path.join(projectRoot, 'src/styles.css') },
      ],
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Could not resolve Vite perf server address.');

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-precise-memory-info'],
  });
  const results = [];

  try {
    for (const size of args.sizes) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });
      await page.goto(`http://127.0.0.1:${address.port}/?size=${size}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('canvas, .scene-fallback', { timeout: 30_000 });
      await page.waitForTimeout(4_000);
      const sample = await page.evaluate(() => window.__galaxyPerf.sample());
      const canvasSignal = await readCanvasSignal(page);
      await page.close();
      results.push({ ...sample, ...canvasSignal });
    }
  } finally {
    await browser.close();
    await server.close();
  }

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log('| Nodes | Edges | FPS | Avg frame | Max frame | JS heap | Canvas lit |');
  console.log('| ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const result of results) {
    const heap = result.heapBytes === null ? 'n/a' : `${(result.heapBytes / 1024 / 1024).toFixed(1)} MB`;
    console.log(
      `| ${result.nodes.toLocaleString()} | ${result.edges.toLocaleString()} | ${result.fps.toFixed(
        1,
      )} | ${result.averageFrameMs.toFixed(1)} ms | ${result.maxFrameMs.toFixed(1)} ms | ${heap} | ${(
        result.nonBackgroundRatio * 100
      ).toFixed(2)}% |`,
    );
  }
}

await run();
