import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GalaxyGraphVisualizer from './GalaxyGraphVisualizer';
import type { CameraCommand, GalaxySceneProps } from './GalaxyScene';
import type { GalaxyCameraView, GraphDataset, GraphEdge, GraphNode } from './types';

let latestSceneProps: GalaxySceneProps | null = null;
let sceneRenderCount = 0;

vi.mock('./GalaxyScene', () => ({
  default: (props: GalaxySceneProps) => {
    sceneRenderCount += 1;
    latestSceneProps = props;
    return (
      <div
        data-testid="galaxy-scene"
        data-active-group={props.activeGroup ?? 'all'}
        data-galaxy-mode={String(props.galaxyMode)}
        data-node-count={String(props.dataset.nodes.length)}
        data-edge-count={String(props.dataset.edges.length)}
        data-paused={String(props.paused)}
        data-selected-node={props.selectedNodeId ?? ''}
        data-selected-edge={props.selectedEdgeId ?? ''}
      />
    );
  },
}));

const nodeA: GraphNode = { id: 'alpha', label: 'Alpha', group: 'One', major: true, size: 4 };
const nodeB: GraphNode = { id: 'beta', label: 'Beta', group: 'Two' };
const edge: GraphEdge = { source: 'alpha', target: 'beta', kind: 'depends', weight: 0.8 };

const dataset: GraphDataset = {
  nodes: [nodeA, nodeB],
  edges: [edge],
  clusters: [{ id: 'cluster-one', label: 'Cluster One', group: 'One' }],
  generatedAt: 'test-dataset',
};

afterEach(() => {
  latestSceneProps = null;
  sceneRenderCount = 0;
  cleanup();
});

describe('GalaxyGraphVisualizer', () => {
  it('renders default controls, filters groups, and reports group changes', () => {
    const onGroupChange = vi.fn();
    render(<GalaxyGraphVisualizer dataset={dataset} onGroupChange={onGroupChange} />);

    expect(screen.getByText('Galaxy Nodes')).toBeTruthy();
    expect(screen.getByText((_, element) => element?.textContent === '2 nodes')).toBeTruthy();
    expect(screen.getByTestId('galaxy-scene').dataset.activeGroup).toBe('all');

    fireEvent.click(screen.getByRole('button', { name: 'One' }));

    expect(onGroupChange).toHaveBeenCalledWith('One');
    expect(screen.getByTestId('galaxy-scene').dataset.activeGroup).toBe('One');
    expect(screen.getByText((_, element) => element?.textContent === '1 nodes')).toBeTruthy();
  });

  it('focuses the best matching search result and emits a camera command', () => {
    const onSelectNode = vi.fn();
    const onNavigate = vi.fn<(command: CameraCommand) => void>();
    render(<GalaxyGraphVisualizer dataset={dataset} onSelectNode={onSelectNode} onNavigate={onNavigate} />);

    fireEvent.change(screen.getByLabelText('Search nodes'), { target: { value: 'bet' } });
    fireEvent.click(screen.getByTitle('Focus matching node'));

    expect(onSelectNode).toHaveBeenCalledWith(nodeB);
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'beta', type: 'focus' }));
    expect(screen.getByTestId('galaxy-scene').dataset.selectedNode).toBe('beta');
  });

  it('selects nodes and edges from scene callbacks and renders the matching detail panel', () => {
    render(<GalaxyGraphVisualizer dataset={dataset} />);

    act(() => {
      latestSceneProps?.onSelectNode(nodeA);
    });
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeTruthy();
    expect(screen.getByText('Node id')).toBeTruthy();

    act(() => {
      latestSceneProps?.onSelectEdge(edge);
    });
    expect(screen.getByRole('heading', { name: /Alpha to Beta/ })).toBeTruthy();
    expect(screen.getByText('Relationship id')).toBeTruthy();
    expect(screen.getByTestId('galaxy-scene').dataset.selectedEdge).toBe('depends:alpha->beta:0');
  });

  it('does not focus the camera when an edge is selected from the scene', () => {
    const onNavigate = vi.fn<(command: CameraCommand) => void>();
    render(<GalaxyGraphVisualizer dataset={dataset} onNavigate={onNavigate} />);

    act(() => {
      latestSceneProps?.onSelectEdge(edge);
    });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('galaxy-scene').dataset.selectedEdge).toBe('depends:alpha->beta:0');
  });

  it('stores camera view updates without re-rendering the HUD', () => {
    const cameraView: GalaxyCameraView = {
      direction: { x: 0, y: 0, z: -1 },
      position: { x: 10, y: 20, z: 30 },
      right: { x: 1, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
    };
    render(<GalaxyGraphVisualizer dataset={dataset} />);
    const initialRenderCount = sceneRenderCount;

    act(() => {
      latestSceneProps?.onCameraViewChange?.(cameraView);
      latestSceneProps?.onCameraViewChange?.({ ...cameraView, position: { x: 11, y: 20, z: 30 } });
    });

    expect(sceneRenderCount).toBe(initialRenderCount);
  });

  it('honors HUD visibility options and calls dataset-size changes', () => {
    const onDatasetSizeChange = vi.fn();
    render(
      <GalaxyGraphVisualizer
        dataset={dataset}
        onDatasetSizeChange={onDatasetSizeChange}
        options={{
          datasetSizes: [2, 10],
          showControls: true,
          showDatasetSizeControls: true,
          showDetailPanel: false,
          showGroupNav: false,
          showLegend: false,
          showNavigationControls: false,
          showSearch: false,
          showStats: false,
        }}
      />,
    );

    expect(screen.queryByRole('navigation', { name: 'Groups' })).toBeNull();
    expect(screen.queryByLabelText('Search nodes')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '10' }));
    expect(onDatasetSizeChange).toHaveBeenCalledWith(10);
  });

  it('does not show large-graph controls unless enabled', () => {
    render(<GalaxyGraphVisualizer dataset={dataset} />);

    expect(screen.queryByTitle('Load more forward')).toBeNull();

    act(() => {
      latestSceneProps?.onSelectNode(nodeA);
    });

    expect(screen.queryByRole('button', { name: /Expand neighbors/ })).toBeNull();
  });

  it('expands selected node neighborhoods and merges returned patches', async () => {
    const expandGraph = vi.fn().mockResolvedValue({ nodes: [{ id: 'gamma', label: 'Gamma' }], edges: [] });
    render(<GalaxyGraphVisualizer dataset={dataset} largeGraph={{ enabled: true, expandGraph }} />);

    act(() => {
      latestSceneProps?.onSelectNode(nodeA);
    });
    fireEvent.click(screen.getByRole('button', { name: /Expand neighbors/ }));

    await waitFor(() =>
      expect(expandGraph).toHaveBeenCalledWith(
        expect.objectContaining({ nodeId: 'alpha', type: 'node' }),
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() => expect(screen.getByTestId('galaxy-scene').dataset.nodeCount).toBe('3'));
  });

  it('expands in a camera direction using the latest camera view', async () => {
    const expandGraph = vi.fn().mockResolvedValue({ nodes: [], edges: [] });
    const cameraView: GalaxyCameraView = {
      direction: { x: 0, y: 0, z: -1 },
      position: { x: 10, y: 20, z: 30 },
      right: { x: 1, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
    };
    render(<GalaxyGraphVisualizer dataset={dataset} largeGraph={{ enabled: true, expandGraph }} />);

    act(() => {
      latestSceneProps?.onCameraViewChange?.(cameraView);
    });
    fireEvent.click(screen.getByTitle('Load more forward'));

    await waitFor(() =>
      expect(expandGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          camera: cameraView,
          direction: 'forward',
          directionVector: { x: 0, y: 0, z: -1 },
          type: 'direction',
        }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('passes async node detail state to custom renderers and supports reload', async () => {
    const loadNodeDetail = vi
      .fn()
      .mockResolvedValueOnce({ name: 'Alpha detail' })
      .mockResolvedValueOnce({ name: 'Alpha detail reload' });

    render(
      <GalaxyGraphVisualizer
        dataset={dataset}
        largeGraph={{ enabled: true, loadNodeDetail }}
        renderNodeDetail={(node, context) => (
          <>
            <h2>{node.label}</h2>
            <span>
              {context?.loading
                ? 'Loading detail'
                : ((context?.detail as { name?: string } | undefined)?.name ?? 'No detail')}
            </span>
            <button type="button" onClick={context?.reload}>
              Reload detail
            </button>
          </>
        )}
      />,
    );

    act(() => {
      latestSceneProps?.onSelectNode(nodeA);
    });

    expect(screen.getByText('Loading detail')).toBeTruthy();
    await screen.findByText('Alpha detail');

    fireEvent.click(screen.getByRole('button', { name: 'Reload detail' }));
    await screen.findByText('Alpha detail reload');
    expect(loadNodeDetail).toHaveBeenCalledTimes(2);
  });

  it('does not let stale detail responses overwrite the current selection', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    const loadNodeDetail = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    render(
      <GalaxyGraphVisualizer
        dataset={dataset}
        largeGraph={{ enabled: true, loadNodeDetail }}
        renderNodeDetail={(node, context) => (
          <>
            <h2>{node.label}</h2>
            <span>
              {context?.loading
                ? 'Loading detail'
                : ((context?.detail as { name?: string } | undefined)?.name ?? 'No detail')}
            </span>
          </>
        )}
      />,
    );

    act(() => {
      latestSceneProps?.onSelectNode(nodeA);
    });
    act(() => {
      latestSceneProps?.onSelectNode(nodeB);
    });
    act(() => {
      resolvers[0]?.({ name: 'Stale alpha' });
      resolvers[1]?.({ name: 'Fresh beta' });
    });

    await screen.findByText('Fresh beta');
    expect(screen.queryByText('Stale alpha')).toBeNull();
  });
});
