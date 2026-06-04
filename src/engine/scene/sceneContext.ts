/**
 * Shared value types passed between the scene orchestrator and its layer modules. These
 * describe the cross-cutting selection/highlight state that several layers read when they
 * recompute their appearance.
 */

export interface NodeSelectionHighlight {
  connectedEdgeIds: Set<string>;
  firstDegreeNodeIds: Set<string>;
  secondDegreeNodeIds: Set<string>;
}

export type SceneFocusMode = 'none' | 'cameraOnly' | 'fullFocus' | 'expanded' | 'path' | 'orbit' | 'partial';

export interface SelectionState {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedNodeHighlight: NodeSelectionHighlight | null;
  selectedEdgeHighlight: NodeSelectionHighlight | null;
  hoveredNodeId: string | null;
  hoveredEdgeId: string | null;
  focusMode: SceneFocusMode;
  pathEdgeIds: Set<string>;
  pathNodeIds: Set<string>;
}
