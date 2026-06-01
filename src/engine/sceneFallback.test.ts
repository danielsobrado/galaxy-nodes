import { describe, expect, it } from 'vitest';
import { createSceneFallbackViewModel, type GalaxySceneFailure } from './sceneFallback';
import type { GraphDataset } from '../domain/types';

describe('scene fallback view model', () => {
  const dataset: GraphDataset = {
    nodes: [{ id: 'a' }, { id: 'b' }],
    edges: [{ source: 'a', target: 'b' }],
    clusters: [{ id: 'cluster-a', label: 'Cluster A' }],
  };

  it('shows graph counts and no retry for unavailable WebGL', () => {
    const failure: GalaxySceneFailure = {
      reason: 'webgl-unavailable',
      message: 'WebGL is unavailable.',
    };

    expect(createSceneFallbackViewModel(dataset, failure)).toMatchObject({
      canRetry: false,
      counts: { clusters: '1', edges: '1', nodes: '2' },
      message: 'WebGL is unavailable.',
      title: 'WebGL unavailable',
    });
  });

  it('allows retry after context loss or scene initialization errors', () => {
    expect(
      createSceneFallbackViewModel(dataset, {
        reason: 'context-lost',
        message: 'The context was lost.',
      }).canRetry,
    ).toBe(true);
    expect(
      createSceneFallbackViewModel(dataset, {
        reason: 'scene-error',
        message: 'Scene failed.',
      }).canRetry,
    ).toBe(true);
  });
});
