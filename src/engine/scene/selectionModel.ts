import type { GraphEdge, GraphNode, ResolvedAccessors, Vec3 } from '../../domain/types';
import type { NodeDegree } from '../sceneData';
import { SELECTED_NODE_EDGE_FOCUS_LIMIT } from '../sceneConstants';
import type { EdgeEndpoints, EdgeVisualState } from '../sceneTypes';
import type { NodeSelectionHighlight } from './sceneContext';

export interface SelectionModelDeps<NMeta = unknown, EMeta = unknown> {
  nodeLookup: Map<string, GraphNode<NMeta>>;
  nodePositions: Map<string, Vec3>;
  edgeEndpoints: Map<string, EdgeEndpoints>;
  edgeStates: Map<string, EdgeVisualState<EMeta>>;
  nodeDegrees: () => ReadonlyMap<string, NodeDegree>;
  accessors: () => ResolvedAccessors<NMeta, EMeta>;
  selectedEdgeId: () => string | null;
}

export interface SelectionModel<EMeta = unknown> {
  /** Record an edge in the incident/neighbor topology indices (called as edges are built). */
  indexSelectableEdge(edgeId: string, edge: GraphEdge<EMeta>): void;
  /** First/second-degree neighborhood + focused incident edges for a selected node. */
  getNodeSelectionHighlight(
    nodeId: string,
    options?: { edgeLimit?: number; secondDegreeLimit?: number },
  ): NodeSelectionHighlight;
  /** Endpoints highlighted for a selected edge. */
  getEdgeSelectionHighlight(edgeId: string): NodeSelectionHighlight;
  /** Placed node ids ranked by total degree, capped to `limit`. */
  rankedHighlightNodeIds(ids: Iterable<string>, limit: number): string[];
  /** Live edge ids (excluding the selected edge) ranked by weight, capped to `limit`. */
  rankedRelationshipEdgeIds(ids: Iterable<string>, limit: number): string[];
}

/**
 * Pure graph-topology layer for selection highlighting. Maintains the per-node incident-edge
 * and neighbor indices and derives the first/second-degree neighborhoods that drive point,
 * planet, edge, and marker emphasis. Depends only on the graph maps and accessors, so it is
 * independently unit-testable.
 */
export function createSelectionModel<NMeta = unknown, EMeta = unknown>(
  deps: SelectionModelDeps<NMeta, EMeta>,
): SelectionModel<EMeta> {
  const { nodeLookup, nodePositions, edgeEndpoints, edgeStates, nodeDegrees, accessors, selectedEdgeId } = deps;
  const incidentEdgeIdsByNodeId = new Map<string, Set<string>>();
  const neighborNodeIdsByNodeId = new Map<string, Set<string>>();

  function addIncidentEdge(nodeId: string, edgeId: string) {
    const edgeIds = incidentEdgeIdsByNodeId.get(nodeId) ?? new Set<string>();
    edgeIds.add(edgeId);
    incidentEdgeIdsByNodeId.set(nodeId, edgeIds);
  }

  function addNeighborNode(sourceNodeId: string, targetNodeId: string) {
    const neighbors = neighborNodeIdsByNodeId.get(sourceNodeId) ?? new Set<string>();
    neighbors.add(targetNodeId);
    neighborNodeIdsByNodeId.set(sourceNodeId, neighbors);
  }

  function indexSelectableEdge(edgeId: string, edge: GraphEdge<EMeta>) {
    const hasSourceNode = nodeLookup.has(edge.source);
    const hasTargetNode = nodeLookup.has(edge.target);

    if (hasSourceNode) addIncidentEdge(edge.source, edgeId);
    if (hasTargetNode) addIncidentEdge(edge.target, edgeId);

    if (hasSourceNode && hasTargetNode) {
      addNeighborNode(edge.source, edge.target);
      addNeighborNode(edge.target, edge.source);
    }
  }

  function rankedHighlightNodeIds(ids: Iterable<string>, limit: number) {
    const degrees = nodeDegrees();
    return Array.from(ids)
      .filter((id) => nodePositions.has(id))
      .sort((left, right) => (degrees.get(right)?.total ?? 0) - (degrees.get(left)?.total ?? 0))
      .slice(0, limit);
  }

  function rankedRelationshipEdgeIds(ids: Iterable<string>, limit: number) {
    const resolved = accessors();
    const selected = selectedEdgeId();
    return Array.from(ids)
      .filter((id) => edgeStates.has(id) && id !== selected)
      .sort((left, right) => {
        const leftState = edgeStates.get(left);
        const rightState = edgeStates.get(right);
        const leftWeight = leftState ? resolved.edgeWeight(leftState.edge) : 0;
        const rightWeight = rightState ? resolved.edgeWeight(rightState.edge) : 0;
        return rightWeight - leftWeight || left.localeCompare(right);
      })
      .slice(0, limit);
  }

  function getNodeSelectionHighlight(
    nodeId: string,
    options: { edgeLimit?: number; secondDegreeLimit?: number } = {},
  ): NodeSelectionHighlight {
    const edgeLimit = options.edgeLimit ?? SELECTED_NODE_EDGE_FOCUS_LIMIT;
    const connectedEdgeIds = new Set(rankedRelationshipEdgeIds(incidentEdgeIdsByNodeId.get(nodeId) ?? [], edgeLimit));
    const firstDegreeNodeIds = new Set<string>();
    const secondDegreeNodeIds = new Set<string>();

    connectedEdgeIds.forEach((edgeId) => {
      const endpoints = edgeEndpoints.get(edgeId);
      if (!endpoints) return;
      if (endpoints.source.isNode && endpoints.source.id !== nodeId) firstDegreeNodeIds.add(endpoints.source.id);
      if (endpoints.target.isNode && endpoints.target.id !== nodeId) firstDegreeNodeIds.add(endpoints.target.id);
    });

    firstDegreeNodeIds.forEach((firstDegreeNodeId) => {
      neighborNodeIdsByNodeId.get(firstDegreeNodeId)?.forEach((secondDegreeNodeId) => {
        if (secondDegreeNodeId !== nodeId && !firstDegreeNodeIds.has(secondDegreeNodeId)) {
          secondDegreeNodeIds.add(secondDegreeNodeId);
        }
      });
    });

    return {
      connectedEdgeIds,
      firstDegreeNodeIds,
      secondDegreeNodeIds: new Set(rankedHighlightNodeIds(secondDegreeNodeIds, options.secondDegreeLimit ?? Infinity)),
    };
  }

  function getEdgeSelectionHighlight(edgeId: string): NodeSelectionHighlight {
    const endpoints = edgeEndpoints.get(edgeId);
    const connectedEdgeIds = new Set<string>([edgeId]);
    const firstDegreeNodeIds = new Set<string>();

    if (endpoints?.source.isNode) firstDegreeNodeIds.add(endpoints.source.id);
    if (endpoints?.target.isNode) firstDegreeNodeIds.add(endpoints.target.id);

    return { connectedEdgeIds, firstDegreeNodeIds, secondDegreeNodeIds: new Set() };
  }

  return {
    indexSelectableEdge,
    getNodeSelectionHighlight,
    getEdgeSelectionHighlight,
    rankedHighlightNodeIds,
    rankedRelationshipEdgeIds,
  };
}
