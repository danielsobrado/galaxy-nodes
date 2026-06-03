import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPointLayer } from './pointLayer';
import { resolveAccessors } from '../../domain/data';
import { resolveGalaxyGraphTheme } from '../rendererConfig';
import type { GraphNode, Vec3 } from '../../domain/types';
import type { EdgeEndpoints } from '../sceneTypes';
import type { SelectionState } from './sceneContext';

const nodes: GraphNode[] = [
  { id: 'a', label: 'a', group: 'g1', size: 10 },
  { id: 'b', label: 'b', group: 'g2', size: 10 },
];
const nodePositions = new Map<string, Vec3>([
  ['a', { x: 0, y: 0, z: 0 }],
  ['b', { x: 1, y: 0, z: 0 }],
]);

function emptySelection(): SelectionState {
  return {
    selectedNodeId: null,
    selectedEdgeId: null,
    selectedNodeHighlight: null,
    selectedEdgeHighlight: null,
    hoveredNodeId: null,
    hoveredEdgeId: null,
  };
}

function build(selection: SelectionState, activeGroup: string | null = null) {
  return createPointLayer({
    world: new THREE.Group(),
    nodes: () => nodes,
    nodePositions,
    accessors: () => resolveAccessors(undefined),
    theme: () => resolveGalaxyGraphTheme(),
    activeGroup: () => activeGroup,
    selection,
    edgeEndpoints: new Map<string, EdgeEndpoints>(),
    galaxyMode: true,
    nodeSizeScale: 1,
    pixelRatio: 1,
  });
}

describe('pointLayer visibility', () => {
  it('renders the selected node larger than an unrelated node', () => {
    const selection = { ...emptySelection(), selectedNodeId: 'a' };
    const layer = build(selection);
    layer.updateAppearance();
    expect(layer.visibleSizeAt(0)).toBeGreaterThan(layer.visibleSizeAt(1));
  });

  it('hides nodes outside the active group when nothing relates them to the selection', () => {
    const layer = build(emptySelection(), 'g1');
    layer.updateAppearance();
    expect(layer.visibleSizeAt(0)).toBeGreaterThan(0); // a is in g1
    expect(layer.visibleSizeAt(1)).toBe(0); // b is in g2 and unrelated
  });
});
