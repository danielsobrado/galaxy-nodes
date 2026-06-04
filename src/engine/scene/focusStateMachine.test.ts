import { describe, expect, it } from 'vitest';
import { reduceFocusState, type FocusState } from './focusStateMachine';

describe('focus state machine', () => {
  it('follows hover, data-ready focus, orbit, recenter, and unfocus transitions', () => {
    let state: FocusState = { name: 'idle' };

    state = reduceFocusState(state, { type: 'NODE_HOVER', nodeId: 'alpha' });
    expect(state).toEqual({ name: 'hoverPreview', nodeId: 'alpha' });

    state = reduceFocusState(state, { type: 'NODE_CLICK', nodeId: 'alpha' });
    expect(state).toEqual({ name: 'preFocus', nodeId: 'alpha', previousNodeId: undefined });

    state = reduceFocusState(state, { type: 'FOCUS_DATA_READY', nodeId: 'alpha' });
    expect(state).toEqual({ name: 'focusingCamera', nodeId: 'alpha', previousNodeId: undefined });

    state = reduceFocusState(state, { type: 'CAMERA_SETTLED', nodeId: 'alpha' });
    expect(state).toEqual({ name: 'focused', nodeId: 'alpha' });

    state = reduceFocusState(state, { type: 'USER_ORBIT_OR_ZOOM' });
    expect(state).toEqual({ name: 'orbitFocus', nodeId: 'alpha' });

    state = reduceFocusState(state, { type: 'RECENTER' });
    expect(state).toEqual({ name: 'focusingCamera', nodeId: 'alpha' });

    state = reduceFocusState(state, { type: 'ESC_OR_BACKGROUND_CLICK' });
    expect(state).toEqual({ name: 'unfocusing', nodeId: 'alpha' });

    state = reduceFocusState(state, { type: 'CAMERA_SETTLED' });
    expect(state).toEqual({ name: 'idle' });
  });

  it('handles loading, partial focus, expansion, path mode, and back', () => {
    let state: FocusState = { name: 'idle' };

    state = reduceFocusState(state, { type: 'NODE_CLICK', nodeId: 'alpha' });
    state = reduceFocusState(state, { nodeId: 'alpha', startedAt: 10, type: 'FOCUS_DATA_MISSING' });
    expect(state).toEqual({ name: 'loadingFocusData', nodeId: 'alpha', previousNodeId: undefined, startedAt: 10 });

    state = reduceFocusState(state, { nodeId: 'alpha', type: 'DATA_TIMEOUT' });
    expect(state).toEqual({ name: 'focusedPartial', nodeId: 'alpha', previousNodeId: undefined });

    state = reduceFocusState(state, { nodeId: 'alpha', type: 'DATA_READY' });
    expect(state).toEqual({ name: 'focused', nodeId: 'alpha' });

    state = reduceFocusState(state, { depth: 1, type: 'EXPAND_NEIGHBORS' });
    expect(state).toEqual({ name: 'expandedFocus', nodeId: 'alpha', depth: 1 });

    state = reduceFocusState(state, { type: 'COLLAPSE_NEIGHBORS' });
    state = reduceFocusState(state, {
      path: { edgeIds: ['edge-a'], nodeIds: ['alpha', 'beta'] },
      pathType: 'dependency',
      type: 'SHOW_PATH',
    });
    expect(state).toEqual({
      name: 'pathFocus',
      nodeId: 'alpha',
      path: { edgeIds: ['edge-a'], nodeIds: ['alpha', 'beta'] },
      pathType: 'dependency',
    });

    state = reduceFocusState(state, { targetNodeId: 'previous', type: 'BACK' });
    expect(state).toEqual({ name: 'navigatingBack', targetNodeId: 'previous' });

    state = reduceFocusState(state, { nodeId: 'previous', type: 'CAMERA_SETTLED' });
    expect(state).toEqual({ name: 'focused', nodeId: 'previous' });
  });

  it('interrupts active focus with a different node click and handles load failure', () => {
    let state: FocusState = { name: 'focusingCamera', nodeId: 'alpha' };

    state = reduceFocusState(state, { nodeId: 'beta', previousNodeId: 'alpha', type: 'NODE_CLICK' });
    expect(state).toEqual({ name: 'preFocus', nodeId: 'beta', previousNodeId: 'alpha' });

    state = reduceFocusState(state, { nodeId: 'beta', startedAt: 20, type: 'FOCUS_DATA_MISSING' });
    state = reduceFocusState(state, { nodeId: 'beta', type: 'LOAD_FAILED' });
    expect(state).toEqual({ name: 'idle' });
  });
});
