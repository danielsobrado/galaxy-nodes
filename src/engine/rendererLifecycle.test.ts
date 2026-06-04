import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGalaxyRendererController, type SceneFactory } from './rendererLifecycle';
import type { GalaxyRendererOptions, GraphUxEvent, SceneCallbacks, SceneRuntime } from './rendererTypes';
import type { GraphDataset } from '../domain/types';

const dataset: GraphDataset = {
  nodes: [{ id: 'alpha', label: 'Alpha', major: true }],
  edges: [],
  clusters: [],
  generatedAt: 'renderer-lifecycle-test',
};

const options: GalaxyRendererOptions = {
  activeGroup: null,
  cameraCommand: null,
  dataset,
  galaxyMode: true,
  selectedEdgeId: null,
  selectedNodeId: null,
  showClusters: true,
};

function makeRuntime(): SceneRuntime {
  return {
    appendDataset: vi.fn(),
    dispose: vi.fn(),
    focusEdge: vi.fn(),
    focusNode: vi.fn(),
    moveCamera: vi.fn(),
    resetCamera: vi.fn(),
    updateAccessors: vi.fn(),
    updateActiveGroup: vi.fn(),
    updateClusterVisibility: vi.fn(),
    updateGalaxyMode: vi.fn(),
    updateMotionPreference: vi.fn(),
    updateNodeSizeScale: vi.fn(),
    updatePlanetSizing: vi.fn(),
    updateSelection: vi.fn(),
    updateTheme: vi.fn(),
    updateUxVariant: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('renderer lifecycle telemetry plumbing', () => {
  it('passes the initial UX variant and updates variant/callback refs in place', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ getContext: vi.fn(() => ({})) })),
    });
    const host = { children: [] } as unknown as HTMLElement;
    const runtime = makeRuntime();
    const onGraphUxEvent = vi.fn<(event: GraphUxEvent) => void>();
    const nextOnGraphUxEvent = vi.fn<(event: GraphUxEvent) => void>();
    let callbacksRef: { current: SceneCallbacks } | null = null;
    const createSceneMock = vi.fn((...args: unknown[]) => {
      callbacksRef = args[13] as { current: SceneCallbacks };
      return runtime;
    });
    const renderer = createGalaxyRendererController(
      host,
      { ...options, uxVariant: 'cameraOnly' },
      { onGraphUxEvent },
      createSceneMock as unknown as SceneFactory,
    );

    expect(createSceneMock.mock.calls[0][12]).toBe('cameraOnly');
    expect(callbacksRef?.current.onGraphUxEvent).toBe(onGraphUxEvent);

    renderer.update({ ...options, uxVariant: 'fullFocus' }, { onGraphUxEvent: nextOnGraphUxEvent });

    expect(runtime.updateUxVariant).toHaveBeenCalledWith('fullFocus');
    expect(callbacksRef?.current.onGraphUxEvent).toBe(nextOnGraphUxEvent);

    renderer.dispose();
  });
});
