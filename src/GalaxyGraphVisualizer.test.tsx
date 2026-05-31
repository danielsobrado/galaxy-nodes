import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GalaxyGraphVisualizer from './GalaxyGraphVisualizer';
import type { CameraCommand, GalaxySceneProps } from './GalaxyScene';
import type { GraphDataset, GraphEdge, GraphNode } from './types';

let latestSceneProps: GalaxySceneProps | null = null;

vi.mock('./GalaxyScene', () => ({
  default: (props: GalaxySceneProps) => {
    latestSceneProps = props;
    return (
      <div
        data-testid="galaxy-scene"
        data-active-group={props.activeGroup ?? 'all'}
        data-galaxy-mode={String(props.galaxyMode)}
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
});
