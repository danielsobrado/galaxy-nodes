import { describe, expect, it } from 'vitest';
import { createNodeSizing } from './nodeSizing';
import { buildSceneNodeIndex, type NodeDegree } from '../sceneData';
import { resolvePlanetSizing } from '../rendererConfig';
import { resolveAccessors } from '../../domain/data';
import type { GraphNode } from '../../domain/types';

const nodes: GraphNode[] = [
  { id: 'hub', label: 'hub', group: 'core', size: 10 },
  { id: 'leaf', label: 'leaf', group: 'core', size: 10 },
  { id: 'outer', label: 'outer', group: 'rim', size: 10 },
];

const degrees = new Map<string, NodeDegree>([
  ['hub', { total: 9, incoming: 4, outgoing: 5 }],
  ['leaf', { total: 1, incoming: 1, outgoing: 0 }],
  ['outer', { total: 3, incoming: 2, outgoing: 1 }],
]);

function sizing(mode: 'accessor' | 'degree', activeGroup: string | null = null) {
  return createNodeSizing({
    nodes: () => nodes,
    nodeDegrees: () => degrees,
    nodeIndex: () => buildSceneNodeIndex(nodes),
    planetSizing: () => resolvePlanetSizing({ mode }),
    activeGroup: () => activeGroup,
    accessors: () => resolveAccessors(undefined),
  });
}

describe('nodeSizing', () => {
  it('ignores degree in accessor mode (constant multiplier)', () => {
    const s = sizing('accessor');
    // hub (degree 9) and leaf (degree 1) have equal size, so equal radius in accessor mode.
    expect(s.planetRadius(nodes[0])).toBeCloseTo(s.planetRadius(nodes[1]), 10);
  });

  it('grows radius monotonically with degree in degree mode', () => {
    const s = sizing('degree');
    const hub = s.planetRadius(nodes[0]); // degree 9
    const outer = s.planetRadius(nodes[2]); // degree 3
    const leaf = s.planetRadius(nodes[1]); // degree 1
    expect(hub).toBeGreaterThan(outer);
    expect(outer).toBeGreaterThan(leaf);
  });

  it('reports the max degree for the mode, scoped to the active group', () => {
    expect(sizing('degree').maxDegreeForMode('degree')).toBe(9);
    // The 'rim' group only contains "outer" (degree 3); hub/leaf are excluded.
    expect(sizing('degree', 'rim').maxDegreeForMode('degree')).toBe(3);
  });
});
