import { describe, expect, it } from 'vitest';
import {
  formatCompactNumber,
  generateGalaxyDataset,
  getEdgeId,
  getNodeColor,
  parseGraphDataset,
} from './data';
import { CATEGORY_COLORS, type GraphNode } from './types';

const sampleNode = (overrides: Partial<GraphNode> = {}): GraphNode => ({
  id: 'node-1',
  label: 'Crypto liquidity surge 1A',
  category: 'Crypto',
  clusterId: 'cluster-0',
  position: { x: 1, y: 2, z: 3 },
  size: 4,
  score: 80,
  sentiment: 'yes',
  metrics: { volume: 1, activeTraders: 2, marketPrice: 3, winRate: 4 },
  isMajor: true,
  ...overrides,
});

describe('generateGalaxyDataset', () => {
  it('produces the requested number of nodes', () => {
    expect(generateGalaxyDataset(10_000).nodes).toHaveLength(10_000);
  });

  it('is deterministic for a given size (ignoring the generated timestamp)', () => {
    const first = generateGalaxyDataset(10_000);
    const second = generateGalaxyDataset(10_000);
    expect(second.nodes).toEqual(first.nodes);
    expect(second.edges).toEqual(first.edges);
    expect(second.clusters).toEqual(first.clusters);
  });

  it('only emits edges that reference existing nodes or clusters', () => {
    const dataset = generateGalaxyDataset(10_000);
    const ids = new Set([
      ...dataset.nodes.map((node) => node.id),
      ...dataset.clusters.map((cluster) => cluster.id),
    ]);
    for (const edge of dataset.edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });

  it('round-trips through parseGraphDataset', () => {
    const dataset = generateGalaxyDataset(10_000);
    const parsed = parseGraphDataset(JSON.parse(JSON.stringify(dataset)));
    expect(parsed.nodes).toEqual(dataset.nodes);
    expect(parsed.edges).toEqual(dataset.edges);
    expect(parsed.clusters).toEqual(dataset.clusters);
  });
});

describe('parseGraphDataset', () => {
  it('rejects a non-object payload', () => {
    expect(() => parseGraphDataset(null)).toThrow(/JSON object/);
  });

  it('rejects a payload missing the required arrays', () => {
    expect(() => parseGraphDataset({ nodes: [] })).toThrow(/nodes, edges, and clusters/);
  });

  it('reports the offending path for an invalid category', () => {
    const dataset = generateGalaxyDataset(10_000);
    const broken = JSON.parse(JSON.stringify(dataset));
    broken.nodes[0].category = 'Nope';
    expect(() => parseGraphDataset(broken)).toThrow(/nodes\[0\]\.category/);
  });

  it('rejects non-finite numbers', () => {
    const dataset = generateGalaxyDataset(10_000);
    const broken = JSON.parse(JSON.stringify(dataset));
    broken.nodes[0].score = Number.POSITIVE_INFINITY;
    // JSON.stringify turns Infinity into null, which also fails the number check.
    expect(() => parseGraphDataset(broken)).toThrow(/nodes\[0\]\.score/);
  });

  it('defaults generatedAt when absent', () => {
    const parsed = parseGraphDataset({ nodes: [], edges: [], clusters: [] });
    expect(typeof parsed.generatedAt).toBe('string');
    expect(parsed.generatedAt.length).toBeGreaterThan(0);
  });
});

describe('getEdgeId', () => {
  it('prefers an explicit id', () => {
    expect(getEdgeId({ id: 'edge-x', source: 'a', target: 'b', weight: 1, kind: 'trade' })).toBe('edge-x');
  });

  it('falls back to a composite id using the index', () => {
    expect(getEdgeId({ source: 'a', target: 'b', weight: 1, kind: 'signal' }, 7)).toBe('signal:a->b:7');
  });
});

describe('getNodeColor', () => {
  it('uses sentiment colors when sharpMoney is on', () => {
    expect(getNodeColor(sampleNode({ sentiment: 'yes' }), true)).toBe('#42f7bd');
    expect(getNodeColor(sampleNode({ sentiment: 'no' }), true)).toBe('#ff6f86');
  });

  it('honours sentiment color overrides', () => {
    expect(getNodeColor(sampleNode({ sentiment: 'yes' }), true, undefined, { yes: '#abcabc' })).toBe('#abcabc');
  });

  it('uses category colors when sharpMoney is off', () => {
    expect(getNodeColor(sampleNode({ category: 'Tech' }), false)).toBe(CATEGORY_COLORS.Tech);
  });
});

describe('formatCompactNumber', () => {
  it('formats thousands and millions compactly', () => {
    expect(formatCompactNumber(1_500)).toBe('1.5K');
    expect(formatCompactNumber(2_400_000)).toBe('2.4M');
  });
});
