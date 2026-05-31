import { describe, expect, expectTypeOf, it } from 'vitest';
import { parseGraphDataset } from '../data';
import type { GalaxyGraphVisualizerProps } from '../GalaxyGraphVisualizer';
import type { GraphAccessors } from '../types';
import {
  CATEGORY_COLORS,
  createMarketAccessors,
  generateGalaxyDataset,
  MARKET_CATEGORIES,
  type MarketClusterMeta,
  type MarketNodeMeta,
} from './markets';

describe('generateGalaxyDataset', () => {
  it('produces the requested number of nodes', () => {
    expect(generateGalaxyDataset(10_000).nodes).toHaveLength(10_000);
  });

  it('is deterministic for a given size (ignoring the timestamp)', () => {
    const first = generateGalaxyDataset(10_000);
    const second = generateGalaxyDataset(10_000);
    expect(second.nodes).toEqual(first.nodes);
    expect(second.edges).toEqual(first.edges);
    expect(second.clusters).toEqual(first.clusters);
  });

  it('emits the generic core shape with trading fields under meta', () => {
    const dataset = generateGalaxyDataset(10_000);
    const node = dataset.nodes[0];
    expect(typeof node.id).toBe('string');
    expect(node.position).toMatchObject({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) });
    expect(typeof node.major).toBe('boolean');
    expect(MARKET_CATEGORIES).toContain(node.group);
    const meta = node.meta as MarketNodeMeta;
    expect(MARKET_CATEGORIES).toContain(meta.category);
    expect(['yes', 'no', 'mixed']).toContain(meta.sentiment);
    expect(meta.metrics).toMatchObject({ volume: expect.any(Number), winRate: expect.any(Number) });
  });

  it('only references existing node or cluster ids in edges', () => {
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

  it('survives a round-trip through the generic parser', () => {
    const dataset = generateGalaxyDataset(10_000);
    const parsed = parseGraphDataset(JSON.parse(JSON.stringify(dataset)));
    expect(parsed.nodes).toEqual(dataset.nodes);
    expect(parsed.clusters).toEqual(dataset.clusters);
  });
});

describe('createMarketAccessors', () => {
  const dataset = generateGalaxyDataset(10_000);
  const major = dataset.nodes.find((node) => node.major)!;
  const point = dataset.nodes.find((node) => !node.major)!;

  it('colors by sentiment when sharpMoney is on', () => {
    const accessors = createMarketAccessors({ sharpMoney: true });
    const sentiment = (major.meta as MarketNodeMeta).sentiment;
    const expected = sentiment === 'yes' ? '#42f7bd' : sentiment === 'no' ? '#ff6f86' : '#d7d7d7';
    expect(accessors.nodeColor!(major)).toBe(expected);
  });

  it('colors by category when sharpMoney is off', () => {
    const accessors = createMarketAccessors({ sharpMoney: false });
    expect(accessors.nodeColor!(major)).toBe(CATEGORY_COLORS[(major.meta as MarketNodeMeta).category]);
  });

  it('labels only major nodes', () => {
    const accessors = createMarketAccessors();
    expect(accessors.nodeLabel!(point)).toBeNull();
    expect(accessors.nodeLabel!(major)).toMatch(/%/);
  });
});

describe('market preset types', () => {
  it('preserves market metadata through generic visualizer props', () => {
    type Props = GalaxyGraphVisualizerProps<MarketNodeMeta, unknown, MarketClusterMeta>;

    expectTypeOf<NonNullable<Props['accessors']>>().toEqualTypeOf<GraphAccessors<MarketNodeMeta, unknown>>();

    const renderNode: NonNullable<Props['renderNodeDetail']> = (node) => {
      expectTypeOf(node.meta).toEqualTypeOf<MarketNodeMeta | undefined>();
      return null;
    };

    const renderEdge: NonNullable<Props['renderEdgeDetail']> = (_edge, endpoints) => {
      expectTypeOf(endpoints.source.node?.meta).toEqualTypeOf<MarketNodeMeta | undefined>();
      return null;
    };

    expect(typeof renderNode).toBe('function');
    expect(typeof renderEdge).toBe('function');
  });
});
