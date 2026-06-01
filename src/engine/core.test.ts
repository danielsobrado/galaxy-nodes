// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGalaxyRenderer, type GalaxyRendererOptions } from './core';
import type { GraphDataset } from '../domain/types';

const dataset: GraphDataset = {
  nodes: [{ id: 'alpha', label: 'Alpha', major: true }],
  edges: [],
  clusters: [],
  generatedAt: 'core-test',
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

describe('createGalaxyRenderer', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports WebGL availability failures through callbacks', () => {
    const host = document.createElement('div');
    const onSceneFailure = vi.fn();

    const renderer = createGalaxyRenderer(host, options, { onSceneFailure });

    expect(onSceneFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'webgl-unavailable',
      }),
    );

    renderer.dispose();
    expect(host.childElementCount).toBe(0);
  });

  it('routes retry failures to updated callbacks', () => {
    const host = document.createElement('div');
    const firstFailure = vi.fn();
    const secondFailure = vi.fn();
    const renderer = createGalaxyRenderer(host, options, { onSceneFailure: firstFailure });

    renderer.update({ ...options, activeGroup: 'team-a' }, { onSceneFailure: secondFailure });
    renderer.retry();

    expect(firstFailure).toHaveBeenCalledTimes(1);
    expect(secondFailure).toHaveBeenCalledTimes(1);
  });

  it('reports context-budget failures before creating another renderer', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue({} as never);
    const host = document.createElement('div');
    const onContextBudgetExceeded = vi.fn();
    const onSceneFailure = vi.fn();

    const renderer = createGalaxyRenderer(
      host,
      { ...options, contextLimit: 0 },
      { onContextBudgetExceeded, onSceneFailure },
    );

    expect(onContextBudgetExceeded).toHaveBeenCalledWith({ active: 0, limit: 0, remaining: 0 });
    expect(onSceneFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('supported limit of 0'),
        reason: 'webgl-unavailable',
      }),
    );

    renderer.dispose();
  });
});
