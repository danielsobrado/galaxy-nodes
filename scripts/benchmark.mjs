import { performance } from 'node:perf_hooks';
import { resolveGraphLayout } from '../dist/core.js';
import { generateGalaxyDataset } from '../dist/presets/initiatives/core.js';

const DEFAULT_SIZES = [10_000, 100_000];

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

  const iterations = Number(args.get('iterations') ?? 3);
  const warmups = Number(args.get('warmups') ?? 1);
  const sizes = String(args.get('sizes') ?? DEFAULT_SIZES.join(','))
    .split(',')
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite);

  if (!Number.isInteger(iterations) || iterations <= 0) throw new Error('iterations must be a positive integer.');
  if (!Number.isInteger(warmups) || warmups < 0) throw new Error('warmups must be a non-negative integer.');
  if (!sizes.length || sizes.some((size) => !Number.isInteger(size) || size <= 0)) {
    throw new Error('sizes must include at least one positive integer.');
  }

  return {
    iterations,
    json: args.get('json') === 'true',
    sizes,
    warmups,
  };
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function sampleHeap() {
  if (typeof global.gc === 'function') global.gc();
  return process.memoryUsage().heapUsed;
}

function runOnce(size) {
  const heapBefore = sampleHeap();
  const generatedAt = performance.now();
  const dataset = generateGalaxyDataset(size);
  const generatedMs = performance.now() - generatedAt;

  const layoutAt = performance.now();
  const layout = resolveGraphLayout(dataset, { seed: `benchmark-${size}` });
  const layoutMs = performance.now() - layoutAt;
  const heapAfter = sampleHeap();

  return {
    edges: dataset.edges.length,
    generatedMs,
    heapDeltaBytes: Math.max(0, heapAfter - heapBefore),
    layoutMs,
    nodes: dataset.nodes.length,
    positionedNodes: layout.nodePositions.size,
  };
}

function summarize(size, samples) {
  return {
    edges: samples.at(-1)?.edges ?? 0,
    generatedMs: median(samples.map((sample) => sample.generatedMs)),
    heapDeltaBytes: median(samples.map((sample) => sample.heapDeltaBytes)),
    layoutMs: median(samples.map((sample) => sample.layoutMs)),
    nodes: size,
    positionedNodes: samples.at(-1)?.positionedNodes ?? 0,
  };
}

function printTable(results) {
  console.log('| Nodes | Edges | Generated | Layout | Heap delta |');
  console.log('| ---: | ---: | ---: | ---: | ---: |');
  for (const result of results) {
    console.log(
      `| ${result.nodes.toLocaleString()} | ${result.edges.toLocaleString()} | ${result.generatedMs.toFixed(
        1,
      )} ms | ${result.layoutMs.toFixed(1)} ms | ${formatBytes(result.heapDeltaBytes)} |`,
    );
  }
}

const args = parseArgs(process.argv.slice(2));
const results = [];

for (const size of args.sizes) {
  const samples = [];
  for (let index = 0; index < args.warmups + args.iterations; index += 1) {
    const sample = runOnce(size);
    if (index >= args.warmups) samples.push(sample);
  }
  results.push(summarize(size, samples));
}

if (args.json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  printTable(results);
}
