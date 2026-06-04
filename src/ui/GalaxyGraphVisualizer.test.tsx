import React from 'react';
import { renderToString } from 'react-dom/server';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GalaxyGraphVisualizer from './GalaxyGraphVisualizer';
import type { CameraCommand, GalaxySceneProps, GraphUxEvent } from './GalaxyScene';
import type { GalaxyCameraView, GraphDataset, GraphEdge, GraphNode } from '../domain/types';

let latestSceneProps: GalaxySceneProps | null = null;
let sceneRenderCount = 0;

vi.mock('./GalaxyScene', () => ({
  default: (props: GalaxySceneProps) => {
    sceneRenderCount += 1;
    latestSceneProps = props;
    return (
      <div
        data-testid="galaxy-scene"
        className="galaxy-scene"
        role="img"
        aria-label={props.accessibility?.label}
        aria-describedby={props.accessibility?.describedBy}
        aria-keyshortcuts={props.accessibility?.keyShortcuts}
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
  vi.useRealTimers();
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
    expect(screen.getByText((_, element) => element?.textContent === '1 node')).toBeTruthy();
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

  it('shows a node-adjacent hover detail panel after the configured delay', () => {
    vi.useFakeTimers();
    const { container } = render(<GalaxyGraphVisualizer dataset={dataset} options={{ hoverDetailDelayMs: 50 }} />);

    act(() => {
      latestSceneProps?.onHoverNode(nodeA);
      latestSceneProps?.onHoverNodeAnchor?.({
        nodeId: 'alpha',
        viewportHeight: 480,
        viewportWidth: 720,
        visible: true,
        x: 260,
        y: 220,
      });
    });

    expect(container.querySelector('.hover-detail-panel')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(49);
    });
    expect(container.querySelector('.hover-detail-panel')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    const panel = container.querySelector('.hover-detail-panel');
    expect(panel?.textContent).toContain('Alpha');
    expect(panel?.textContent).toContain('Node id');

    act(() => {
      latestSceneProps?.onHoverNode(null);
      latestSceneProps?.onHoverNodeAnchor?.(null);
    });
    expect(container.querySelector('.hover-detail-panel')).toBeNull();
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

  it('hides the theme selector by default', () => {
    render(<GalaxyGraphVisualizer dataset={dataset} />);

    expect(screen.queryByLabelText('Theme')).toBeNull();
    expect(latestSceneProps?.theme).toBe('galaxy-dark');
  });

  it('updates the scene theme from the uncontrolled theme selector', () => {
    const { container } = render(<GalaxyGraphVisualizer dataset={dataset} options={{ showThemeControl: true }} />);

    const select = screen.getByLabelText('Theme') as HTMLSelectElement;
    expect(select.value).toBe('galaxy-dark');
    expect(latestSceneProps?.theme).toBe('galaxy-dark');

    fireEvent.change(select, { target: { value: 'network-light' } });

    expect(select.value).toBe('network-light');
    expect(latestSceneProps?.theme).toBe('network-light');
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--gn-bg')).toBe('#ffffff');
  });

  it('calls onThemeChange without mutating controlled theme state', () => {
    const onThemeChange = vi.fn();
    const { rerender } = render(
      <GalaxyGraphVisualizer
        dataset={dataset}
        theme="galaxy-dark"
        onThemeChange={onThemeChange}
        options={{ showThemeControl: true }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'network-light' } });

    expect(onThemeChange).toHaveBeenCalledWith('network-light');
    expect(latestSceneProps?.theme).toBe('galaxy-dark');

    rerender(
      <GalaxyGraphVisualizer
        dataset={dataset}
        theme="network-light"
        onThemeChange={onThemeChange}
        options={{ showThemeControl: true }}
      />,
    );

    expect((screen.getByLabelText('Theme') as HTMLSelectElement).value).toBe('network-light');
    expect(latestSceneProps?.theme).toBe('network-light');
  });

  it('shows and hides legend and key legend overlays from options', () => {
    const { rerender } = render(
      <GalaxyGraphVisualizer
        dataset={dataset}
        legend={<span>Relationship legend</span>}
        keyLegend={<div aria-label="Shortcut legend">Shortcut legend</div>}
      />,
    );

    expect(screen.getByText('Relationship legend')).toBeTruthy();
    expect(screen.getByLabelText('Shortcut legend')).toBeTruthy();

    rerender(
      <GalaxyGraphVisualizer
        dataset={dataset}
        legend={<span>Relationship legend</span>}
        keyLegend={<div aria-label="Shortcut legend">Shortcut legend</div>}
        options={{ showKeyLegend: false, showLegend: false }}
      />,
    );

    expect(screen.queryByText('Relationship legend')).toBeNull();
    expect(screen.queryByLabelText('Shortcut legend')).toBeNull();
  });

  it('renders a non-visual graph summary and wires it to the scene description', () => {
    render(<GalaxyGraphVisualizer dataset={dataset} />);

    const summaryId = latestSceneProps?.accessibility?.describedBy;
    const summary = document.getElementById(summaryId!);
    expect(summaryId).toBeTruthy();
    expect(screen.getByRole('img', { hidden: true })).toBeTruthy();
    expect(summary?.textContent).toContain('Showing 2 of 2 nodes and 1 of 1 edges');
    expect(summary?.textContent).toContain('Alpha');
    expect(summary?.textContent).toContain('Alpha to Beta');
  });

  it('accepts localized chrome labels', () => {
    render(
      <GalaxyGraphVisualizer
        dataset={dataset}
        labels={{
          alphaBadge: 'BETA',
          allGroups: 'Todos',
          groupsNav: 'Equipos',
          motionOff: 'Movimiento pausado',
          motionOn: 'Movimiento activo',
          pauseMotion: 'Pausar movimiento',
          playMotion: 'Activar movimiento',
          searchInput: 'Buscar nodos',
          searchPlaceholder: 'Buscar',
        }}
      />,
    );

    expect(screen.getByText('BETA')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Equipos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Todos' })).toBeTruthy();
    expect(screen.getByLabelText('Buscar nodos')).toBeTruthy();
    expect(screen.getByText('Movimiento pausado')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Activar movimiento' }));

    expect(screen.getByText('Movimiento activo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pausar movimiento' })).toBeTruthy();
  });

  it('server-renders without touching browser-only scene APIs', () => {
    expect(() => renderToString(<GalaxyGraphVisualizer dataset={dataset} />)).not.toThrow();
  });

  it('supports keyboard node traversal from the graph scene', () => {
    const onSelectNode = vi.fn();
    const onNavigate = vi.fn<(command: CameraCommand) => void>();
    render(<GalaxyGraphVisualizer dataset={dataset} onSelectNode={onSelectNode} onNavigate={onNavigate} />);

    const scene = screen.getByRole('img', { name: 'Interactive graph visualization', hidden: true });
    expect(scene.getAttribute('aria-keyshortcuts')).toContain('PageDown');

    fireEvent.keyDown(scene, { key: 'PageDown' });
    expect(onSelectNode).toHaveBeenLastCalledWith(nodeA);
    expect(onNavigate).toHaveBeenLastCalledWith(expect.objectContaining({ nodeId: 'alpha', type: 'focus' }));
    expect(screen.getByRole('status').textContent).toContain('Alpha selected, node 1 of 2');

    fireEvent.keyDown(scene, { key: 'PageDown' });
    expect(onSelectNode).toHaveBeenLastCalledWith(nodeB);
    expect(onNavigate).toHaveBeenLastCalledWith(expect.objectContaining({ nodeId: 'beta', type: 'focus' }));

    fireEvent.keyDown(scene, { key: 'Home' });
    expect(onSelectNode).toHaveBeenLastCalledWith(nodeA);

    fireEvent.keyDown(scene, { key: 'Escape' });
    expect(onSelectNode).toHaveBeenLastCalledWith(null);
  });

  it('passes context budget configuration and callbacks to the scene', () => {
    const onContextBudgetExceeded = vi.fn();
    render(
      <GalaxyGraphVisualizer
        dataset={dataset}
        onContextBudgetExceeded={onContextBudgetExceeded}
        options={{ webglContextLimit: 2 }}
      />,
    );

    expect(latestSceneProps?.contextLimit).toBe(2);
    latestSceneProps?.onContextBudgetExceeded?.({ active: 2, limit: 2, remaining: 0 });
    expect(onContextBudgetExceeded).toHaveBeenCalledWith({ active: 2, limit: 2, remaining: 0 });
  });

  it('passes graph UX telemetry variant and callback to the scene', () => {
    const onGraphUxEvent = vi.fn<(event: GraphUxEvent) => void>();
    render(
      <GalaxyGraphVisualizer dataset={dataset} onGraphUxEvent={onGraphUxEvent} options={{ uxVariant: 'fullFocus' }} />,
    );

    expect(latestSceneProps?.uxVariant).toBe('fullFocus');

    act(() => {
      latestSceneProps?.onGraphUxEvent?.({
        taskId: 'task-1',
        timestampMs: 42,
        type: 'task_completed',
        success: true,
        answerCorrect: true,
      });
    });
    expect(onGraphUxEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'task_completed' }));
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

  it('keeps an uncontrolled edge selection by display id across expansion merges', async () => {
    const secondEdge: GraphEdge = { source: 'beta', target: 'alpha', kind: 'supports', weight: 0.4 };
    const edgeDataset: GraphDataset = { ...dataset, edges: [edge, secondEdge] };
    const expandGraph = vi.fn().mockResolvedValue({ nodes: [{ id: 'gamma', label: 'Gamma' }], edges: [] });
    render(<GalaxyGraphVisualizer dataset={edgeDataset} largeGraph={{ enabled: true, expandGraph }} />);

    act(() => {
      latestSceneProps?.onSelectEdge(secondEdge);
      latestSceneProps?.onCameraViewChange?.({
        direction: { x: 0, y: 0, z: -1 },
        position: { x: 10, y: 20, z: 30 },
        right: { x: 1, y: 0, z: 0 },
        target: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 },
      });
    });
    expect(screen.getByTestId('galaxy-scene').dataset.selectedEdge).toBe('supports:beta->alpha:1');

    fireEvent.click(screen.getByTitle('Load more forward'));

    await waitFor(() => expect(screen.getByTestId('galaxy-scene').dataset.nodeCount).toBe('3'));
    expect(screen.getByTestId('galaxy-scene').dataset.selectedEdge).toBe('supports:beta->alpha:1');
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

  it('clears previous node detail while loading a new selection', async () => {
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
            <span>{context?.loading ? 'Loading detail' : 'Loaded detail'}</span>
            <span>{(context?.detail as { name?: string } | undefined)?.name ?? 'No detail'}</span>
          </>
        )}
      />,
    );

    act(() => {
      latestSceneProps?.onSelectNode(nodeA);
    });
    act(() => {
      resolvers[0]?.({ name: 'Alpha detail' });
    });
    await screen.findByText('Alpha detail');

    act(() => {
      latestSceneProps?.onSelectNode(nodeB);
    });

    expect(screen.getByText('Loading detail')).toBeTruthy();
    expect(screen.getByText('No detail')).toBeTruthy();
    expect(screen.queryByText('Alpha detail')).toBeNull();
  });
});
