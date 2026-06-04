import { describe, expect, it } from 'vitest';
import { resolveAccessors } from '../domain/data';
import type { GraphDataset } from '../domain/types';
import type { ResolvedLayoutCluster } from '../domain/layout';
import type { NodeDegree } from './sceneData';
import { projectGraphVisibility } from './visibilityModel';

const dataset: GraphDataset = {
  nodes: [
    { id: 'hub', label: 'Hub', group: 'core', major: true },
    { id: 'strong', label: 'Strong', group: 'core' },
    { id: 'medium', label: 'Medium', group: 'core' },
    { id: 'weak', label: 'Weak', group: 'core' },
    { id: 'second-hop', label: 'Second hop', group: 'core' },
    { id: 'other', label: 'Other', group: 'other', major: true },
  ],
  edges: [
    { id: 'hub-strong', source: 'hub', target: 'strong', weight: 0.95 },
    { id: 'hub-medium', source: 'hub', target: 'medium', weight: 0.7 },
    { id: 'hub-weak', source: 'hub', target: 'weak', weight: 0.1 },
    { id: 'medium-second', source: 'medium', target: 'second-hop', weight: 0.8 },
    { id: 'other-hub', source: 'other', target: 'hub', weight: 0.4 },
  ],
  clusters: [
    { id: 'cluster-core', label: 'Core', group: 'core' },
    { id: 'cluster-other', label: 'Other', group: 'other' },
  ],
};

const clusters: ResolvedLayoutCluster[] = [
  {
    id: 'cluster-core',
    label: 'Core',
    group: 'core',
    center: { x: 0, y: 0, z: 0 },
    generated: false,
    nodeCount: 5,
    radius: 100,
  },
  {
    id: 'cluster-other',
    label: 'Other',
    group: 'other',
    center: { x: 200, y: 0, z: 0 },
    generated: false,
    nodeCount: 1,
    radius: 80,
  },
];

const nodeDegrees = new Map<string, NodeDegree>([
  ['hub', { incoming: 1, outgoing: 3, total: 4 }],
  ['strong', { incoming: 1, outgoing: 0, total: 1 }],
  ['medium', { incoming: 1, outgoing: 1, total: 2 }],
  ['weak', { incoming: 1, outgoing: 0, total: 1 }],
  ['second-hop', { incoming: 1, outgoing: 0, total: 1 }],
  ['other', { incoming: 0, outgoing: 1, total: 1 }],
]);

function project(overrides: Partial<Parameters<typeof projectGraphVisibility>[0]> = {}) {
  return projectGraphVisibility({
    accessors: resolveAccessors(undefined),
    activeGroup: null,
    clusters,
    dataset,
    focusedClusterId: null,
    mode: 'default',
    nodeDegrees,
    options: { enabled: true },
    pathEdgeIds: new Set(),
    pathNodeIds: new Set(),
    selectedNodeId: null,
    ...overrides,
  });
}

describe('projectGraphVisibility', () => {
  it('keeps default view under cluster, node, edge, and label budgets', () => {
    const projection = project({
      options: {
        budgets: {
          default: {
            maxEdgesPerNode: 1,
            maxLabels: 2,
            maxNodesPerCluster: 2,
            maxVisibleClusters: 1,
            maxVisibleEdges: 1,
            maxVisibleNodes: 2,
          },
        },
        enabled: true,
      },
    });

    expect(projection.mode).toBe('default');
    expect([...projection.visibleClusterIds]).toEqual(['cluster-core']);
    expect(projection.visibleNodeIds.size).toBeLessThanOrEqual(2);
    expect(projection.visibleEdgeIds.size).toBeLessThanOrEqual(1);
    expect(projection.labelNodeIds.size + projection.labelClusterIds.size).toBeLessThanOrEqual(2);
    expect(projection.overflow.hiddenNodeCount).toBeGreaterThan(0);
  });

  it('ranks expanded neighborhoods, includes bounded second-hop nodes, and reports overflow', () => {
    const projection = project({
      mode: 'expanded',
      options: {
        budgets: {
          expanded: {
            maxEdgesPerNode: 8,
            maxLabels: 12,
            maxPrimaryNeighbors: 2,
            maxSecondHopNeighbors: 1,
            maxVisibleEdges: 4,
            maxVisibleNodes: 4,
          },
        },
        enabled: true,
      },
      selectedNodeId: 'hub',
    });

    expect(projection.visibleNodeIds.has('hub')).toBe(true);
    expect(projection.visibleNodeIds.has('strong')).toBe(true);
    expect(projection.visibleNodeIds.has('medium')).toBe(true);
    expect(projection.visibleNodeIds.has('weak')).toBe(false);
    expect(projection.visibleNodeIds.has('second-hop')).toBe(true);
    expect(projection.overflow.hiddenNodeCount).toBeGreaterThan(0);
  });

  it('keeps path nodes and edges visible even when the active group would hide them', () => {
    const projection = project({
      activeGroup: 'other',
      mode: 'path',
      pathEdgeIds: new Set(['hub-strong']),
      pathNodeIds: new Set(['hub', 'strong']),
      selectedNodeId: 'hub',
    });

    expect(projection.mode).toBe('path');
    expect(projection.visibleNodeIds.has('hub')).toBe(true);
    expect(projection.visibleNodeIds.has('strong')).toBe(true);
    expect(projection.visibleEdgeIds.has('hub-strong')).toBe(true);
  });

  it('projects deep view with a bounded local search', () => {
    const projection = project({
      mode: 'deep',
      options: {
        budgets: {
          deep: {
            maxDepth: 2,
            maxEdgesPerNode: 20,
            maxLabels: 35,
            maxVisibleEdges: 3,
            maxVisibleNodes: 3,
          },
        },
        enabled: true,
      },
      selectedNodeId: 'hub',
    });

    expect(projection.mode).toBe('deep');
    expect(projection.visibleNodeIds.has('hub')).toBe(true);
    expect(projection.visibleNodeIds.size).toBeLessThanOrEqual(3);
    expect(projection.visibleEdgeIds.size).toBeLessThanOrEqual(3);
    expect(projection.overflow.hiddenNodeCount).toBeGreaterThan(0);
  });
});
