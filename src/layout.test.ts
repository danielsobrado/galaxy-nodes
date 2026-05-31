import { describe, expect, it } from 'vitest';
import { resolveGraphLayout } from './layout';
import type { GraphDataset } from './types';

describe('resolveGraphLayout', () => {
  it('generates deterministic positions for positionless nodes', () => {
    const dataset: GraphDataset = {
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ source: 'a', target: 'b' }],
    };

    const first = resolveGraphLayout(dataset, { seed: 'stable' });
    const second = resolveGraphLayout(dataset, { seed: 'stable' });

    expect(first.nodePositions.get('a')).toEqual(second.nodePositions.get('a'));
    expect(first.generatedNodePositions).toBe(true);
    expect(first.clusters).toHaveLength(1);
    expect(first.clusters[0]).toMatchObject({ generated: true, label: 'Component 1', nodeCount: 2 });
  });

  it('uses graph identity, not generatedAt, for the default seed', () => {
    const first = resolveGraphLayout({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ source: 'a', target: 'b' }],
      generatedAt: '2025-01-01T00:00:00.000Z',
    });
    const second = resolveGraphLayout({
      nodes: [{ id: 'b' }, { id: 'a' }],
      edges: [{ source: 'a', target: 'b' }],
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(first.nodePositions.get('a')).toEqual(second.nodePositions.get('a'));
  });

  it('varies generated positions by seed', () => {
    const dataset: GraphDataset = {
      nodes: [{ id: 'a' }],
      edges: [],
    };

    const first = resolveGraphLayout(dataset, { seed: 'one' });
    const second = resolveGraphLayout(dataset, { seed: 'two' });

    expect(first.nodePositions.get('a')).not.toEqual(second.nodePositions.get('a'));
  });

  it('preserves authored positions by default', () => {
    const dataset: GraphDataset = {
      nodes: [{ id: 'a', position: { x: 1, y: 2, z: 3 } }],
      edges: [],
      clusters: [],
    };

    const layout = resolveGraphLayout(dataset);

    expect(layout.nodePositions.get('a')).toEqual({ x: 1, y: 2, z: 3 });
    expect(layout.generatedNodePositions).toBe(false);
    expect(layout.clusters).toEqual([]);
  });

  it('can regenerate authored positions when preservation is disabled', () => {
    const dataset: GraphDataset = {
      nodes: [{ id: 'a', position: { x: 1, y: 2, z: 3 } }],
      edges: [],
    };

    const layout = resolveGraphLayout(dataset, { preserveExistingPositions: false, seed: 'regenerate' });

    expect(layout.nodePositions.get('a')).not.toEqual({ x: 1, y: 2, z: 3 });
    expect(layout.generatedNodePositions).toBe(true);
  });

  it('generates one cluster per uncovered group when laying out missing positions', () => {
    const dataset: GraphDataset = {
      nodes: [
        { id: 'a', group: 'Alpha' },
        { id: 'b', group: 'Alpha' },
        { id: 'c', group: 'Beta' },
      ],
      edges: [],
    };

    const layout = resolveGraphLayout(dataset, { seed: 'groups' });

    expect(layout.clusters.map((cluster) => cluster.label).sort()).toEqual(['Alpha', 'Beta']);
    expect(layout.clusterLookup.get('layout-alpha')?.group).toBe('Alpha');
  });

  it('fills missing cluster centers and radii without mutating the source cluster', () => {
    const dataset: GraphDataset = {
      nodes: [{ id: 'a', group: 'Alpha' }],
      edges: [],
      clusters: [{ id: 'alpha', label: 'Alpha', group: 'Alpha' }],
    };

    const layout = resolveGraphLayout(dataset, { seed: 'cluster' });

    expect(layout.clusterLookup.get('alpha')?.center).toEqual(expect.objectContaining({ x: expect.any(Number) }));
    expect(layout.clusterLookup.get('alpha')?.radius).toEqual(expect.any(Number));
    expect(dataset.clusters?.[0].center).toBeUndefined();
    expect(dataset.clusters?.[0].radius).toBeUndefined();
  });

  it('throws a clear error when layout is disabled and positions are missing', () => {
    expect(() =>
      resolveGraphLayout(
        {
          nodes: [{ id: 'a' }],
          edges: [],
        },
        false,
      ),
    ).toThrow(/layout is disabled.*node "a".*position/);
  });
});
