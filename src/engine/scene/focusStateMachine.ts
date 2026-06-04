import type { FocusPathResult, PathFocusType } from '../rendererTypes';

export type FocusState =
  | { name: 'idle' }
  | { name: 'hoverPreview'; nodeId: string }
  | { name: 'preFocus'; nodeId: string; previousNodeId?: string }
  | { name: 'loadingFocusData'; nodeId: string; previousNodeId?: string; startedAt: number }
  | { name: 'focusingCamera'; nodeId: string; previousNodeId?: string }
  | { name: 'focusedPartial'; nodeId: string; previousNodeId?: string }
  | { name: 'focused'; nodeId: string }
  | { name: 'expandedFocus'; depth: 1 | 2; nodeId: string }
  | { name: 'pathFocus'; nodeId: string; path: FocusPathResult; pathType: PathFocusType }
  | { name: 'orbitFocus'; nodeId: string }
  | { name: 'navigatingBack'; targetNodeId?: string }
  | { name: 'unfocusing'; nodeId?: string };

export type FocusEvent =
  | { type: 'NODE_HOVER'; nodeId: string }
  | { type: 'HOVER_END'; nodeId?: string }
  | { type: 'NODE_CLICK'; dataReady?: boolean; nodeId: string; previousNodeId?: string }
  | { type: 'FOCUS_DATA_READY'; nodeId: string }
  | { type: 'FOCUS_DATA_MISSING'; nodeId: string; startedAt: number }
  | { type: 'DATA_READY'; nodeId: string }
  | { type: 'DATA_TIMEOUT'; nodeId: string }
  | { type: 'LOAD_FAILED'; nodeId: string }
  | { type: 'CAMERA_SETTLED'; nodeId?: string }
  | { type: 'EXPAND_NEIGHBORS'; depth: 1 | 2 }
  | { type: 'COLLAPSE_NEIGHBORS' }
  | { type: 'SHOW_PATH'; nodeId?: string; path: FocusPathResult; pathType: PathFocusType }
  | { type: 'HIDE_PATH' }
  | { type: 'USER_ORBIT_OR_ZOOM' }
  | { type: 'RECENTER' }
  | { type: 'BACK'; targetNodeId?: string }
  | { type: 'ESC_OR_BACKGROUND_CLICK' }
  | { type: 'CANCEL' };

export function focusedNodeId(state: FocusState): string | null {
  if (
    state.name === 'preFocus' ||
    state.name === 'loadingFocusData' ||
    state.name === 'focusingCamera' ||
    state.name === 'focusedPartial' ||
    state.name === 'focused' ||
    state.name === 'expandedFocus' ||
    state.name === 'pathFocus' ||
    state.name === 'orbitFocus'
  ) {
    return state.nodeId;
  }
  if (state.name === 'unfocusing') return state.nodeId ?? null;
  return null;
}

export function reduceFocusState(state: FocusState, event: FocusEvent): FocusState {
  if (event.type === 'NODE_CLICK') {
    const previousNodeId = focusedNodeId(state) ?? event.previousNodeId;
    return { name: 'preFocus', nodeId: event.nodeId, previousNodeId: previousNodeId ?? undefined };
  }

  if (event.type === 'ESC_OR_BACKGROUND_CLICK') {
    return { name: 'unfocusing', nodeId: focusedNodeId(state) ?? undefined };
  }

  if (event.type === 'CANCEL') return { name: 'idle' };

  switch (state.name) {
    case 'idle':
      if (event.type === 'NODE_HOVER') return { name: 'hoverPreview', nodeId: event.nodeId };
      return state;

    case 'hoverPreview':
      if (event.type === 'HOVER_END') return { name: 'idle' };
      if (event.type === 'NODE_HOVER') return { name: 'hoverPreview', nodeId: event.nodeId };
      return state;

    case 'preFocus':
      if (event.type === 'FOCUS_DATA_MISSING' && event.nodeId === state.nodeId) {
        return {
          name: 'loadingFocusData',
          nodeId: state.nodeId,
          previousNodeId: state.previousNodeId,
          startedAt: event.startedAt,
        };
      }
      if (event.type === 'FOCUS_DATA_READY' && event.nodeId === state.nodeId) {
        return { name: 'focusingCamera', nodeId: state.nodeId, previousNodeId: state.previousNodeId };
      }
      return state;

    case 'loadingFocusData':
      if (event.type === 'DATA_READY') {
        if (event.nodeId !== state.nodeId) return state;
        return { name: 'focusingCamera', nodeId: state.nodeId, previousNodeId: state.previousNodeId };
      }
      if (event.type === 'DATA_TIMEOUT') {
        if (event.nodeId !== state.nodeId) return state;
        return { name: 'focusedPartial', nodeId: state.nodeId, previousNodeId: state.previousNodeId };
      }
      if (event.type === 'LOAD_FAILED') {
        if (event.nodeId !== state.nodeId) return state;
        return { name: 'idle' };
      }
      return state;

    case 'focusingCamera':
      if (event.type === 'CAMERA_SETTLED' && (!event.nodeId || event.nodeId === state.nodeId)) {
        return { name: 'focused', nodeId: state.nodeId };
      }
      return state;

    case 'focusedPartial':
      if (event.type === 'DATA_READY' && event.nodeId === state.nodeId)
        return { name: 'focused', nodeId: state.nodeId };
      return state;

    case 'focused':
      if (event.type === 'EXPAND_NEIGHBORS') return { name: 'expandedFocus', nodeId: state.nodeId, depth: event.depth };
      if (event.type === 'SHOW_PATH')
        return { name: 'pathFocus', nodeId: event.nodeId ?? state.nodeId, path: event.path, pathType: event.pathType };
      if (event.type === 'USER_ORBIT_OR_ZOOM') return { name: 'orbitFocus', nodeId: state.nodeId };
      if (event.type === 'BACK') return { name: 'navigatingBack', targetNodeId: event.targetNodeId };
      return state;

    case 'expandedFocus':
      if (event.type === 'COLLAPSE_NEIGHBORS') return { name: 'focused', nodeId: state.nodeId };
      if (event.type === 'USER_ORBIT_OR_ZOOM') return { name: 'orbitFocus', nodeId: state.nodeId };
      if (event.type === 'BACK') return { name: 'navigatingBack', targetNodeId: event.targetNodeId };
      return state;

    case 'pathFocus':
      if (event.type === 'HIDE_PATH') return { name: 'focused', nodeId: state.nodeId };
      if (event.type === 'BACK') return { name: 'navigatingBack', targetNodeId: event.targetNodeId };
      return state;

    case 'orbitFocus':
      if (event.type === 'RECENTER') return { name: 'focusingCamera', nodeId: state.nodeId };
      if (event.type === 'BACK') return { name: 'navigatingBack', targetNodeId: event.targetNodeId };
      return state;

    case 'navigatingBack':
      if (event.type === 'CAMERA_SETTLED' && state.targetNodeId) return { name: 'focused', nodeId: state.targetNodeId };
      if (event.type === 'CAMERA_SETTLED') return { name: 'idle' };
      return state;

    case 'unfocusing':
      if (event.type === 'CAMERA_SETTLED') return { name: 'idle' };
      return state;
  }
}
