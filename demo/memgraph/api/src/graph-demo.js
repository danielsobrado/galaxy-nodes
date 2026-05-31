// NOTE: This is a standalone copy of the generator in ../../../../src/presets/markets.tsx,
// kept self-contained so the demo container has no dependency on the library
// source. It uses different cluster/major-node constants on purpose (smaller,
// seed-oriented dataset). Keep the GraphDataset shape in sync if the library's
// contract changes.
const CATEGORIES = ['Crypto', 'Politics', 'Geopolitics', 'Finance', 'Tech', 'Sports', 'Culture', 'Social', 'Other'];

const TOPICS = [
  'liquidity surge',
  'policy drift',
  'semiconductor supply',
  'rate path',
  'frontier model',
  'energy shock',
  'stablecoin rails',
  'defense corridor',
  'cloud capex',
  'election odds',
  'media reach',
  'derivatives flow',
];

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randBetween(rand, min, max) {
  return min + (max - min) * rand();
}

function gaussian(rand) {
  const u = 1 - rand();
  const v = 1 - rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pick(rand, values) {
  return values[Math.floor(rand() * values.length)];
}

function makeMetrics(rand) {
  return {
    volume: Math.round(randBetween(rand, 1_200_000, 840_000_000)),
    activeTraders: Math.round(randBetween(rand, 40, 18_000)),
    marketPrice: Number(randBetween(rand, 41, 99.8).toFixed(1)),
    winRate: Number(randBetween(rand, 42, 100).toFixed(1)),
  };
}

function sentimentFor(score, rand) {
  if (score > 66 && rand() > 0.22) return 'yes';
  if (score < 42 && rand() > 0.24) return 'no';
  return 'mixed';
}

function buildClusters(count, rand) {
  const clusterCount = Math.max(12, Math.min(28, Math.round(count / 450)));
  const arms = 4;

  return Array.from({ length: clusterCount }, (_, index) => {
    const arm = index % arms;
    const armOffset = (arm / arms) * Math.PI * 2;
    const distance = 65 + Math.pow(index / clusterCount, 0.72) * 860;
    const angle = armOffset + distance * 0.006 + randBetween(rand, -0.32, 0.32);
    const category = CATEGORIES[index % CATEGORIES.length];

    return {
      id: `cluster-${index}`,
      label: category.toUpperCase(),
      category,
      center: {
        x: Math.cos(angle) * distance + gaussian(rand) * 34,
        y: gaussian(rand) * 38 + Math.sin(angle * 2.1) * 22,
        z: Math.sin(angle) * distance * 0.46 + gaussian(rand) * 48,
      },
      radius: randBetween(rand, 46, 118),
      nodeCount: 0,
      score: randBetween(rand, 56, 99),
    };
  });
}

function makeNodeLabel(index, category, rand) {
  const suffix = Math.floor(randBetween(rand, 100, 9999)).toString(36).toUpperCase();
  return `${category} ${pick(rand, TOPICS)} ${suffix}`;
}

export function generateDemoGraph(count = 8000) {
  const rand = mulberry32(count * 97 + 42);
  const clusters = buildClusters(count, rand);
  const nodes = [];
  const majorEvery = Math.max(180, Math.floor(count / 42));

  for (let index = 0; index < count; index += 1) {
    const cluster = clusters[Math.floor(Math.pow(rand(), 1.45) * clusters.length)];
    const isMajor = index % majorEvery === 0 || rand() > 0.9986;
    const localScale = isMajor ? cluster.radius * 0.36 : cluster.radius;
    const score = randBetween(rand, 18, 99.5);
    const metrics = makeMetrics(rand);

    cluster.nodeCount += 1;
    nodes.push({
      id: `node-${index}`,
      label: makeNodeLabel(index, cluster.category, rand),
      category: cluster.category,
      clusterId: cluster.id,
      position: {
        x: cluster.center.x + gaussian(rand) * localScale * randBetween(rand, 0.24, 0.95),
        y: cluster.center.y + gaussian(rand) * localScale * 0.36,
        z: cluster.center.z + gaussian(rand) * localScale * randBetween(rand, 0.18, 0.72),
      },
      size: isMajor ? randBetween(rand, 17, 42) : randBetween(rand, 1.1, 4.8),
      score,
      sentiment: sentimentFor(score, rand),
      metrics,
      isMajor,
    });
  }

  const majorNodes = nodes.filter((node) => node.isMajor);
  const edges = [];

  for (let index = 0; index < clusters.length - 1; index += 1) {
    edges.push({
      id: `edge-filament-${index}`,
      source: clusters[index].id,
      target: clusters[index + 1].id,
      weight: randBetween(rand, 0.18, 0.92),
      kind: 'filament',
    });
  }

  for (let index = 0; index < majorNodes.length; index += 1) {
    const source = majorNodes[index];
    const target = majorNodes[(index + 1 + Math.floor(rand() * 7)) % majorNodes.length];
    edges.push({
      id: `edge-${index}`,
      source: source.id,
      target: target.id,
      weight: randBetween(rand, 0.35, 1),
      kind: rand() > 0.46 ? 'signal' : 'trade',
    });
  }

  return {
    nodes,
    edges,
    clusters,
    generatedAt: new Date().toISOString(),
  };
}
