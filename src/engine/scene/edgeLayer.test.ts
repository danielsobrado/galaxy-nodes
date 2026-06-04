import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createEdgeLayer } from './edgeLayer';
import { resolveAccessors } from '../../domain/data';
import { resolveGalaxyGraphTheme, type GalaxyGraphThemeInput } from '../rendererConfig';
import type { GraphEdge, GraphNode, Vec3 } from '../../domain/types';
import { EDGE_UNRELATED_DIM } from '../sceneConstants';
import type { EdgeEndpoints, EdgeVisualState } from '../sceneTypes';
import type { SelectionState } from './sceneContext';

type Mat = THREE.MeshBasicMaterial | THREE.LineBasicMaterial;

const nodes: GraphNode[] = [
  { id: 'a', label: 'a', group: 'core', size: 10 },
  { id: 'b', label: 'b', group: 'core', size: 10 },
  { id: 'c', label: 'c', group: 'core', size: 10 },
];
const edges: GraphEdge[] = [
  { id: 'e0', source: 'a', target: 'b' },
  { id: 'e1', source: 'b', target: 'c' },
];

function emptySelection(): SelectionState {
  return {
    selectedNodeId: null,
    selectedEdgeId: null,
    selectedNodeHighlight: null,
    selectedEdgeHighlight: null,
    hoveredNodeId: null,
    hoveredEdgeId: null,
    focusMode: 'none',
    pathEdgeIds: new Set(),
    pathNodeIds: new Set(),
  };
}

function build(selection: SelectionState, theme: GalaxyGraphThemeInput = 'galaxy-dark') {
  const edgeStates = new Map<string, EdgeVisualState>();
  const layer = createEdgeLayer({
    world: new THREE.Group(),
    edgeRenderMode: 'tube',
    edgeLookup: new Map<string, GraphEdge>(),
    edgeEndpoints: new Map<string, EdgeEndpoints>(),
    edgeStates,
    pickTargets: [],
    nodeLookup: new Map(nodes.map((node) => [node.id, node])),
    nodePositions: new Map<string, Vec3>(nodes.map((node, index) => [node.id, { x: index, y: 0, z: 0 }])),
    clusterLookup: new Map(),
    accessors: () => resolveAccessors(undefined),
    activeGroup: () => null,
    galaxyMode: () => true,
    theme: () => resolveGalaxyGraphTheme(theme),
    planetRadius: () => 1,
    selection,
    indexSelectableEdge: () => {},
  });
  edges.forEach(layer.addEdge);
  const opacity = (id: string) => (edgeStates.get(id)!.visual.material as Mat).opacity;
  const baseOpacity = (id: string) => edgeStates.get(id)!.baseOpacity;
  const radius = (id: string) => {
    const geometry = edgeStates.get(id)!.visual.geometry as THREE.TubeGeometry;
    return geometry.parameters.radius;
  };
  return { layer, opacity, baseOpacity, radius };
}

describe('edgeLayer.applyAppearance', () => {
  it('leaves edges at their base opacity when nothing is selected', () => {
    const { layer, opacity, baseOpacity } = build(emptySelection());
    layer.applyAppearance();
    expect(opacity('e0')).toBeCloseTo(baseOpacity('e0'), 6);
    expect(opacity('e1')).toBeCloseTo(baseOpacity('e1'), 6);
  });

  it('boosts the selected edge and dims unrelated edges', () => {
    const selection = { ...emptySelection(), selectedEdgeId: 'e0' };
    const { layer, opacity, baseOpacity } = build(selection);
    layer.applyAppearance();
    expect(opacity('e0')).toBeGreaterThan(baseOpacity('e0'));
    expect(opacity('e0')).toBeGreaterThan(opacity('e1'));
    expect(opacity('e1')).toBeCloseTo(baseOpacity('e1') * EDGE_UNRELATED_DIM, 6);
  });

  it('keeps edge tube radius unchanged in the light theme', () => {
    const dark = build(emptySelection(), 'galaxy-dark');
    const light = build(emptySelection(), 'network-light');

    expect(light.radius('e0')).toBeCloseTo(dark.radius('e0'), 6);
  });

  it('uses visibility projection to hide unrelated edges unless they are selected', () => {
    const selection = {
      ...emptySelection(),
      selectedEdgeId: 'e1',
      visibility: {
        labelClusterIds: new Set<string>(),
        labelNodeIds: new Set<string>(),
        mode: 'expanded' as const,
        overflow: { hiddenEdgeCount: 0, hiddenNodeCount: 0, summaries: [] },
        visibleClusterIds: new Set<string>(),
        visibleEdgeIds: new Set<string>(['e0']),
        visibleNodeIds: new Set<string>(),
      },
    };
    const edgeStates = new Map<string, EdgeVisualState>();
    const layer = createEdgeLayer({
      world: new THREE.Group(),
      edgeRenderMode: 'tube',
      edgeLookup: new Map<string, GraphEdge>(),
      edgeEndpoints: new Map<string, EdgeEndpoints>(),
      edgeStates,
      pickTargets: [],
      nodeLookup: new Map(nodes.map((node) => [node.id, node])),
      nodePositions: new Map<string, Vec3>(nodes.map((node, index) => [node.id, { x: index, y: 0, z: 0 }])),
      clusterLookup: new Map(),
      accessors: () => resolveAccessors(undefined),
      activeGroup: () => null,
      galaxyMode: () => true,
      theme: () => resolveGalaxyGraphTheme(),
      planetRadius: () => 1,
      selection,
      indexSelectableEdge: () => {},
    });
    edges.forEach(layer.addEdge);

    layer.updateVisibility();

    expect(edgeStates.get('e0')?.visible).toBe(true);
    expect(edgeStates.get('e1')?.visible).toBe(true);
  });
});
