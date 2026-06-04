import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GalaxyScene, { type GalaxySceneProps } from './GalaxyScene';
import { createGalaxyRenderer } from '../engine/core';
import type { GalaxyRenderer, GalaxyRendererCallbacks, GalaxyRendererOptions, GraphUxEvent } from '../engine/core';
import type { GraphDataset } from '../domain/types';

const mocks = vi.hoisted(() => ({
  latestCallbacks: null as GalaxyRendererCallbacks | null,
  renderer: {
    backFocus: vi.fn(),
    collapseAll: vi.fn(),
    collapseNeighbors: vi.fn(),
    dispose: vi.fn(),
    expandDeep: vi.fn(),
    expandNeighbors: vi.fn(),
    focusEdge: vi.fn(),
    focusNode: vi.fn(),
    hidePath: vi.fn(),
    inspectPath: vi.fn(),
    moveCamera: vi.fn(),
    recenterFocus: vi.fn(),
    resetCamera: vi.fn(),
    retry: vi.fn(),
    showPath: vi.fn(),
    unfocus: vi.fn(),
    update: vi.fn(),
  } as GalaxyRenderer,
}));

vi.mock('../engine/core', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    createGalaxyRenderer: vi.fn(
      (_host: HTMLElement, _options: GalaxyRendererOptions, callbacks: GalaxyRendererCallbacks) => {
        mocks.latestCallbacks = callbacks;
        return mocks.renderer;
      },
    ),
  };
});

const dataset: GraphDataset = {
  nodes: [{ id: 'alpha', label: 'Alpha', major: true }],
  edges: [],
  clusters: [],
  generatedAt: 'scene-test',
};

function makeProps(overrides: Partial<GalaxySceneProps> = {}): GalaxySceneProps {
  return {
    activeGroup: null,
    cameraCommand: null,
    dataset,
    galaxyMode: true,
    onHoverEdge: vi.fn(),
    onHoverNode: vi.fn(),
    onSelectEdge: vi.fn(),
    onSelectNode: vi.fn(),
    selectedEdgeId: null,
    selectedNodeId: null,
    showClusters: true,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mocks.latestCallbacks = null;
  vi.clearAllMocks();
});

describe('GalaxyScene', () => {
  it('mounts the core renderer, sends updates, and disposes on cleanup', () => {
    const { rerender, unmount } = render(<GalaxyScene {...makeProps()} />);

    expect(screen.getByRole('img', { name: 'Interactive graph visualization' })).toBeTruthy();
    expect(createGalaxyRenderer).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({ activeGroup: null, dataset }),
      expect.objectContaining({ onSelectNode: expect.any(Function) }),
    );

    rerender(<GalaxyScene {...makeProps({ activeGroup: 'team-a' })} />);
    expect(mocks.renderer.update).toHaveBeenCalledWith(
      expect.objectContaining({ activeGroup: 'team-a' }),
      expect.objectContaining({ onSelectNode: expect.any(Function) }),
    );

    unmount();
    expect(mocks.renderer.dispose).toHaveBeenCalled();
  });

  it('exposes caller-provided accessibility labels for non-visual fallbacks', () => {
    render(<GalaxyScene {...makeProps({ accessibility: { describedBy: 'graph-summary', label: 'Revenue graph' } })} />);

    const scene = screen.getByRole('img', { name: 'Revenue graph' });
    expect(scene.getAttribute('aria-describedby')).toBe('graph-summary');
  });

  it('passes graph UX telemetry options and callbacks to the core renderer', () => {
    const onGraphUxEvent = vi.fn<(event: GraphUxEvent) => void>();
    const { rerender } = render(<GalaxyScene {...makeProps({ onGraphUxEvent, uxVariant: 'fullFocus' })} />);

    expect(createGalaxyRenderer).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({ uxVariant: 'fullFocus' }),
      expect.objectContaining({ onGraphUxEvent }),
    );

    act(() => {
      mocks.latestCallbacks?.onGraphUxEvent?.({
        taskId: 'task-1',
        timestampMs: 12,
        type: 'task_started',
        variant: 'fullFocus',
      });
    });
    expect(onGraphUxEvent).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-1' }));

    rerender(<GalaxyScene {...makeProps({ onGraphUxEvent, uxVariant: 'cameraOnly' })} />);
    expect(mocks.renderer.update).toHaveBeenCalledWith(
      expect.objectContaining({ uxVariant: 'cameraOnly' }),
      expect.objectContaining({ onGraphUxEvent }),
    );
  });

  it('renders fallback state from core failures and retries the renderer', () => {
    const onSceneFailure = vi.fn();
    render(<GalaxyScene {...makeProps({ onSceneFailure })} />);

    act(() => {
      mocks.latestCallbacks?.onSceneFailure?.({
        reason: 'context-lost',
        message: 'The WebGL context was lost.',
      });
    });

    expect(onSceneFailure).toHaveBeenCalledWith(expect.objectContaining({ reason: 'context-lost' }));
    expect(screen.getByRole('status').textContent).toContain('The WebGL context was lost.');

    fireEvent.click(screen.getByRole('button', { name: 'Retry renderer' }));
    expect(mocks.renderer.retry).toHaveBeenCalled();
  });

  it('cleans up renderer instances during mount and unmount stress', () => {
    const mounted = Array.from({ length: 20 }, (_, index) =>
      render(<GalaxyScene {...makeProps({ activeGroup: `group-${index}` })} />),
    );

    mounted.forEach((entry) => entry.unmount());

    expect(createGalaxyRenderer).toHaveBeenCalledTimes(20);
    expect(mocks.renderer.dispose).toHaveBeenCalledTimes(20);
  });
});
