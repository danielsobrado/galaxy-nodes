import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSelectionModel } from './selectionModel';
import { resolveAccessors } from '../../domain/data';
import type { GraphEdge, GraphNode, Vec3 } from '../../domain/types';
import type { NodeDegree } from '../sceneData';
import type { EdgeEndpoints, EdgeVisualState, SceneEdgeEndpoint } from '../sceneTypes';

type TestGraphEdge = GraphEdge & { id: string };

function nodeEndpoint(id: string): SceneEdgeEndpoint {
  return { id, isNode: true, label: id, position: new THREE.Vector3(), radius: 1 };
}

/**
 * Build a selection model over a small fixed graph:
 *   a—b, b—c, c—d, and a—e   (e is a leaf off a; d is two hops from a via b—c—d)
 */
function buildModel() {
  const nodeIds = ['a', 'b', 'c', 'd', 'e'];
  const edges: TestGraphEdge[] = [
    { id: 'a-b', source: 'a', target: 'b' },
    { id: 'b-c', source: 'b', target: 'c' },
    { id: 'c-d', source: 'c', target: 'd' },
    { id: 'a-e', source: 'a', target: 'e' },
  ];

  const nodeLookup = new Map<string, GraphNode>(nodeIds.map((id) => [id, { id, label: id }]));
  const nodePositions = new Map<string, Vec3>(nodeIds.map((id) => [id, { x: 0, y: 0, z: 0 }]));
  const edgeEndpoints = new Map<string, EdgeEndpoints>(
    edges.map((edge) => [edge.id, { source: nodeEndpoint(edge.source), target: nodeEndpoint(edge.target) }]),
  );
  const edgeStates = new Map<string, EdgeVisualState>(
    edges.map((edge) => [edge.id, { edge } as unknown as EdgeVisualState]),
  );
  const nodeDegrees = new Map<string, NodeDegree>(
    nodeIds.map((id) => [id, { total: 1, incoming: 0, outgoing: 0 } as NodeDegree]),
  );

  const model = createSelectionModel({
    nodeLookup,
    nodePositions,
    edgeEndpoints,
    edgeStates,
    nodeDegrees: () => nodeDegrees,
    accessors: () => resolveAccessors(undefined),
    selectedEdgeId: () => null,
  });

  edges.forEach((edge) => model.indexSelectableEdge(edge.id, edge));
  return model;
}

describe('selectionModel', () => {
  it('derives first- and second-degree neighborhoods for a selected node', () => {
    const model = buildModel();
    const highlight = model.getNodeSelectionHighlight('a');

    expect([...highlight.connectedEdgeIds].sort()).toEqual(['a-b', 'a-e']);
    expect([...highlight.firstDegreeNodeIds].sort()).toEqual(['b', 'e']);
    // c is reachable from b (a's neighbor); the selected node and first-degree nodes are excluded.
    expect([...highlight.secondDegreeNodeIds].sort()).toEqual(['c']);
  });

  it('highlights only the incident endpoints for a selected edge', () => {
    const model = buildModel();
    const highlight = model.getEdgeSelectionHighlight('b-c');

    expect([...highlight.connectedEdgeIds]).toEqual(['b-c']);
    expect([...highlight.firstDegreeNodeIds].sort()).toEqual(['b', 'c']);
    expect(highlight.secondDegreeNodeIds.size).toBe(0);
  });

  it('ranks relationship edges by weight and excludes the selected edge', () => {
    const nodeLookup = new Map<string, GraphNode>([
      ['hub', { id: 'hub', label: 'hub' }],
      ['x', { id: 'x', label: 'x' }],
      ['y', { id: 'y', label: 'y' }],
    ]);
    const edges: TestGraphEdge[] = [
      { id: 'light', source: 'hub', target: 'x', weight: 0.2 },
      { id: 'heavy', source: 'hub', target: 'y', weight: 0.9 },
    ];
    const edgeStates = new Map<string, EdgeVisualState>(
      edges.map((edge) => [edge.id, { edge } as unknown as EdgeVisualState]),
    );

    const model = createSelectionModel({
      nodeLookup,
      nodePositions: new Map(),
      edgeEndpoints: new Map(),
      edgeStates,
      nodeDegrees: () => new Map(),
      accessors: () => resolveAccessors(undefined),
      selectedEdgeId: () => 'light',
    });

    expect(model.rankedRelationshipEdgeIds(['light', 'heavy'], 5)).toEqual(['heavy']);
  });
});
