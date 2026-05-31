import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Focus,
  GitBranch,
  Layers3,
  Navigation,
  Pause,
  Play,
  Radar,
  RotateCcw,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import GalaxyScene, { type CameraCommand, type GalaxyGraphTheme } from './GalaxyScene';
import { formatCompactNumber, getEdgeId } from './data';
import type { GraphLayoutInput } from './layout';
import type {
  EdgeEndpoint,
  GraphAccessors,
  GraphDataset,
  GraphEdge,
  GraphNode,
  SpaceDirection,
} from './types';

export interface GraphStats {
  nodes: number;
  groups: number;
  edges: number;
  major: number;
}

export interface GalaxyGraphVisualizerOptions {
  datasetSizes?: readonly number[];
  galaxyMode?: boolean;
  showClusters?: boolean;
  showControls?: boolean;
  showDatasetSizeControls?: boolean;
  showDetailPanel?: boolean;
  showGroupNav?: boolean;
  showLegend?: boolean;
  showNavigationControls?: boolean;
  showSearch?: boolean;
  showStats?: boolean;
  showTimeline?: boolean;
}

export interface GalaxyGraphVisualizerProps<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
  /** Visual accessors. Memoize so motion/selection don't rebuild the scene. */
  accessors?: GraphAccessors<NMeta, EMeta>;
  brandLabel?: string;
  className?: string;
  /** Extra toggles rendered in the control ribbon (e.g. domain-specific modes). */
  controlActions?: ReactNode;
  dataset: GraphDataset<NMeta, EMeta, CMeta>;
  /** Group filter buttons. Defaults to the distinct `node.group` values. */
  groups?: readonly string[];
  initialGroup?: string | null;
  /** Replaces the legend strip; nothing renders without it. */
  legend?: ReactNode;
  /** Optional built-in spatial layout. Omit for auto, pass false to require authored coordinates. */
  layout?: GraphLayoutInput;
  /** Called when a dataset-size button is pressed; supply a new dataset. */
  onDatasetSizeChange?: (size: number) => void;
  onGroupChange?: (group: string | null) => void;
  onHoverEdge?: (edge: GraphEdge<EMeta> | null) => void;
  onHoverNode?: (node: GraphNode<NMeta> | null) => void;
  onNavigate?: (command: CameraCommand) => void;
  onSelectEdge?: (edge: GraphEdge<EMeta> | null) => void;
  onSelectNode?: (node: GraphNode<NMeta> | null) => void;
  options?: GalaxyGraphVisualizerOptions;
  renderEdgeDetail?: (
    edge: GraphEdge<EMeta>,
    endpoints: { source: EdgeEndpoint<NMeta>; target: EdgeEndpoint<NMeta> },
  ) => ReactNode;
  renderNodeDetail?: (node: GraphNode<NMeta>) => ReactNode;
  renderStats?: (stats: GraphStats) => ReactNode;
  selectedEdgeId?: string | null;
  selectedNodeId?: string | null;
  sideRailActions?: ReactNode;
  theme?: GalaxyGraphTheme;
}

function distinctGroups<NMeta>(nodes: GraphNode<NMeta>[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const node of nodes) {
    if (node.group && !seen.has(node.group)) {
      seen.add(node.group);
      out.push(node.group);
    }
  }
  return out;
}

function findBestMatch<NMeta, EMeta, CMeta>(
  dataset: GraphDataset<NMeta, EMeta, CMeta>,
  query: string,
  activeGroup: string | null,
): GraphNode<NMeta> | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  return (
    dataset.nodes.find((node) => {
      if (activeGroup !== null && node.group !== activeGroup) return false;
      return (node.label ?? node.id).toLowerCase().includes(normalized) || node.id.toLowerCase() === normalized;
    }) ?? null
  );
}

function findEndpoint<NMeta, EMeta, CMeta>(
  dataset: GraphDataset<NMeta, EMeta, CMeta>,
  id: string,
): EdgeEndpoint<NMeta> {
  const node = dataset.nodes.find((entry) => entry.id === id);
  if (node) {
    return { id: node.id, label: node.label ?? node.id, group: node.group, isNode: true, node };
  }

  const cluster = (dataset.clusters ?? []).find((entry) => entry.id === id);
  if (cluster) {
    return { id: cluster.id, label: cluster.label, group: cluster.group, isNode: false, node: null };
  }

  return { id, label: id, isNode: false, node: null };
}

function themeStyle(theme: GalaxyGraphTheme | undefined) {
  return {
    '--gn-bg': theme?.background,
    '--gn-panel-accent': theme?.panelAccentColor,
    '--gn-selected': theme?.selectedColor,
  } as CSSProperties;
}

export default function GalaxyGraphVisualizer<NMeta = unknown, EMeta = unknown, CMeta = unknown>({
  accessors,
  brandLabel = 'Galaxy Nodes',
  className,
  controlActions,
  dataset,
  groups,
  initialGroup = null,
  legend,
  layout,
  onDatasetSizeChange,
  onGroupChange,
  onHoverEdge,
  onHoverNode,
  onNavigate,
  onSelectEdge,
  onSelectNode,
  options,
  renderEdgeDetail,
  renderNodeDetail,
  renderStats,
  selectedEdgeId,
  selectedNodeId,
  sideRailActions,
  theme,
}: GalaxyGraphVisualizerProps<NMeta, EMeta, CMeta>) {
  const [activeGroup, setActiveGroup] = useState<string | null>(initialGroup);
  const [showClusters, setShowClusters] = useState(options?.showClusters ?? true);
  const [galaxyMode, setGalaxyMode] = useState(options?.galaxyMode ?? true);
  const [playing, setPlaying] = useState(true);
  const [search, setSearch] = useState('');
  const [internalSelectedNode, setInternalSelectedNode] = useState<GraphNode<NMeta> | null>(null);
  const [hoverNode, setHoverNode] = useState<GraphNode<NMeta> | null>(null);
  const [internalSelectedEdge, setInternalSelectedEdge] = useState<GraphEdge<EMeta> | null>(null);
  const [hoverEdge, setHoverEdge] = useState<GraphEdge<EMeta> | null>(null);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null);

  const showControls = options?.showControls ?? true;
  const showStats = options?.showStats ?? true;
  const showNavigationControls = options?.showNavigationControls ?? true;
  const showDetailPanel = options?.showDetailPanel ?? true;
  const showDatasetSizeControls = options?.showDatasetSizeControls ?? Boolean(options?.datasetSizes?.length);

  useEffect(() => {
    if (options?.showClusters !== undefined) setShowClusters(options.showClusters);
  }, [options?.showClusters]);

  useEffect(() => {
    if (options?.galaxyMode !== undefined) setGalaxyMode(options.galaxyMode);
  }, [options?.galaxyMode]);

  const groupList = useMemo(() => (groups ? [...groups] : distinctGroups(dataset.nodes)), [groups, dataset.nodes]);

  const groupNodes = useMemo(() => {
    if (activeGroup === null) return dataset.nodes;
    return dataset.nodes.filter((node) => node.group === activeGroup);
  }, [activeGroup, dataset.nodes]);

  const endpointGroups = useMemo(() => {
    const values = new Map<string, string | undefined>();
    dataset.nodes.forEach((node) => values.set(node.id, node.group));
    (dataset.clusters ?? []).forEach((cluster) => values.set(cluster.id, cluster.group));
    return values;
  }, [dataset.clusters, dataset.nodes]);

  // Precompute edge <-> display-id maps once per dataset. Resolving ids by
  // scanning dataset.edges with indexOf on every lookup was O(n^2).
  const { edgeDisplayIds, edgeByDisplayId } = useMemo(() => {
    const byEdge = new Map<GraphEdge<EMeta>, string>();
    const byId = new Map<string, GraphEdge<EMeta>>();
    dataset.edges.forEach((edge, index) => {
      const id = getEdgeId(edge, index);
      byEdge.set(edge, id);
      byId.set(id, edge);
    });
    return { edgeDisplayIds: byEdge, edgeByDisplayId: byId };
  }, [dataset.edges]);

  const displayEdgeId = useCallback((edge: GraphEdge<EMeta>) => edgeDisplayIds.get(edge) ?? getEdgeId(edge), [edgeDisplayIds]);

  const groupEdges = useMemo(() => {
    if (activeGroup === null) return dataset.edges;
    return dataset.edges.filter(
      (edge) => endpointGroups.get(edge.source) === activeGroup || endpointGroups.get(edge.target) === activeGroup,
    );
  }, [activeGroup, dataset.edges, endpointGroups]);

  const selectedNode = useMemo(() => {
    if (selectedNodeId !== undefined) return dataset.nodes.find((node) => node.id === selectedNodeId) ?? null;
    return internalSelectedNode && dataset.nodes.includes(internalSelectedNode) ? internalSelectedNode : null;
  }, [dataset.nodes, internalSelectedNode, selectedNodeId]);

  const selectedEdge = useMemo(() => {
    if (selectedEdgeId !== undefined) return (selectedEdgeId !== null && edgeByDisplayId.get(selectedEdgeId)) || null;
    return internalSelectedEdge && dataset.edges.includes(internalSelectedEdge) ? internalSelectedEdge : null;
  }, [dataset.edges, edgeByDisplayId, internalSelectedEdge, selectedEdgeId]);

  const stats = useMemo<GraphStats>(() => {
    const groupCount = new Set(groupNodes.map((node) => node.group ?? '')).size;
    const major = groupNodes.filter((node) => node.major).length;
    return {
      edges: groupEdges.length,
      groups: groupCount,
      major,
      nodes: groupNodes.length,
    };
  }, [groupEdges.length, groupNodes]);

  const issueCameraCommand = useCallback(
    (command: Omit<CameraCommand, 'nonce'>) => {
      const nextCommand = { ...command, nonce: Date.now() } as CameraCommand;
      setCameraCommand(nextCommand);
      onNavigate?.(nextCommand);
    },
    [onNavigate],
  );

  const selectNode = useCallback(
    (node: GraphNode<NMeta> | null) => {
      if (selectedNodeId === undefined) setInternalSelectedNode(node);
      if (node) {
        if (selectedEdgeId === undefined) setInternalSelectedEdge(null);
        if (selectedEdge) onSelectEdge?.(null);
      }
      onSelectNode?.(node);
    },
    [onSelectEdge, onSelectNode, selectedEdge, selectedEdgeId, selectedNodeId],
  );

  const hover = useCallback(
    (node: GraphNode<NMeta> | null) => {
      setHoverNode(node);
      onHoverNode?.(node);
    },
    [onHoverNode],
  );

  const selectEdge = useCallback(
    (edge: GraphEdge<EMeta> | null) => {
      if (selectedEdgeId === undefined) setInternalSelectedEdge(edge);
      if (edge) {
        if (selectedNodeId === undefined) setInternalSelectedNode(null);
        if (selectedNode) onSelectNode?.(null);
      }
      onSelectEdge?.(edge);
    },
    [onSelectEdge, onSelectNode, selectedEdgeId, selectedNode, selectedNodeId],
  );

  const hoverConnection = useCallback(
    (edge: GraphEdge<EMeta> | null) => {
      setHoverEdge(edge);
      onHoverEdge?.(edge);
    },
    [onHoverEdge],
  );

  function clearSelection() {
    if (selectedNodeId === undefined) setInternalSelectedNode(null);
    else if (selectedNodeId !== null) onSelectNode?.(null);
    if (selectedEdgeId === undefined) setInternalSelectedEdge(null);
    else if (selectedEdgeId !== null) onSelectEdge?.(null);
  }

  function chooseGroup(group: string | null) {
    setActiveGroup(group);
    clearSelection();
    onGroupChange?.(group);
  }

  function requestDatasetSize(size: number) {
    onDatasetSizeChange?.(size);
    clearSelection();
    setHoverNode(null);
    setHoverEdge(null);
  }

  function focusNode(node: GraphNode<NMeta> | null) {
    if (!node) return;
    selectNode(node);
    issueCameraCommand({ nodeId: node.id, type: 'focus' });
  }

  function focusEdge(edge: GraphEdge<EMeta> | null) {
    if (!edge) return;
    selectEdge(edge);
    issueCameraCommand({ edgeId: displayEdgeId(edge), type: 'focus-edge' });
  }

  function moveCamera(direction: SpaceDirection) {
    issueCameraCommand({ direction, type: 'move' });
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    focusNode(findBestMatch(dataset, search, activeGroup));
  }

  const inspectedNode = selectedNode ?? (selectedEdge ? null : hoverNode);
  const inspectedEdge = selectedNode ? null : selectedEdge ?? (!inspectedNode ? hoverEdge : null);
  const currentSelectedNodeId = selectedNode?.id ?? null;
  const currentSelectedEdgeId = currentSelectedNodeId || !selectedEdge ? null : displayEdgeId(selectedEdge);
  const sourceEndpoint = inspectedEdge ? findEndpoint(dataset, inspectedEdge.source) : null;
  const targetEndpoint = inspectedEdge ? findEndpoint(dataset, inspectedEdge.target) : null;

  return (
    <main className={['galaxy-nodes', className].filter(Boolean).join(' ')} style={themeStyle(theme)}>
      <GalaxyScene<NMeta, EMeta, CMeta>
        dataset={dataset}
        activeGroup={activeGroup}
        showClusters={showClusters}
        galaxyMode={galaxyMode}
        layout={layout}
        accessors={accessors}
        paused={!playing}
        theme={theme}
        cameraCommand={cameraCommand}
        selectedNodeId={currentSelectedNodeId}
        selectedEdgeId={currentSelectedEdgeId}
        onSelectNode={selectNode}
        onHoverNode={hover}
        onSelectEdge={selectEdge}
        onHoverEdge={hoverConnection}
      />

      <header className="top-bar">
        <div className="brand">
          <CircleDot size={20} aria-hidden="true" />
          <span>{brandLabel}</span>
          <b>ALPHA</b>
        </div>
        {(options?.showGroupNav ?? true) && groupList.length ? (
          <nav className="category-nav" aria-label="Groups">
            <button className={activeGroup === null ? 'is-active' : ''} type="button" aria-pressed={activeGroup === null} onClick={() => chooseGroup(null)}>
              All
            </button>
            {groupList.map((group) => (
              <button key={group} className={group === activeGroup ? 'is-active' : ''} type="button" aria-pressed={group === activeGroup} onClick={() => chooseGroup(group)}>
                {group}
              </button>
            ))}
          </nav>
        ) : null}
        {(options?.showSearch ?? true) ? (
          <form className="search-box" onSubmit={submitSearch}>
            <button type="submit" title="Focus matching node">
              <Search size={15} aria-hidden="true" />
            </button>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search node" aria-label="Search nodes" />
          </form>
        ) : null}
      </header>

      {showControls ? (
        <section className="control-ribbon" aria-label="Graph controls">
          <div className="toggle-row">
            <button type="button" className={showClusters ? 'toggle is-on' : 'toggle'} aria-pressed={showClusters} onClick={() => setShowClusters((value) => !value)}>
              <Layers3 size={15} aria-hidden="true" />
              Clusters <span>{showClusters ? 'ON' : 'OFF'}</span>
            </button>
            {controlActions}
          </div>

          {(options?.showTimeline ?? true) ? (
            <div className="playback">
              <button
                type="button"
                className="icon-button"
                onClick={() => setPlaying((value) => !value)}
                title={playing ? 'Pause motion' : 'Play motion'}
                aria-pressed={playing}
              >
                {playing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
              </button>
              <span>{playing ? 'Motion on' : 'Paused'}</span>
            </div>
          ) : null}

          {showStats ? (
            renderStats ? (
              renderStats(stats)
            ) : (
              <div className="stats">
                <span>
                  <b>{stats.groups}</b> groups
                </span>
                <span>
                  <b>{formatCompactNumber(stats.nodes)}</b> nodes
                </span>
                <span>
                  <b>{stats.edges}</b> edges
                </span>
                <span>
                  <b>{stats.major}</b> major
                </span>
              </div>
            )
          ) : null}

          {showDatasetSizeControls && options?.datasetSizes?.length && onDatasetSizeChange ? (
            <div className="segmented" aria-label="Dataset size">
              {options.datasetSizes.map((size) => (
                <button key={size} type="button" className={dataset.nodes.length === size ? 'is-active' : ''} aria-pressed={dataset.nodes.length === size} onClick={() => requestDatasetSize(size)}>
                  {formatCompactNumber(size)}
                </button>
              ))}
            </div>
          ) : null}

          <button type="button" className={galaxyMode ? 'pill-button is-active' : 'pill-button'} aria-pressed={galaxyMode} onClick={() => setGalaxyMode((value) => !value)}>
            <Sparkles size={15} aria-hidden="true" />
            Galaxy
          </button>
        </section>
      ) : null}

      <aside className="side-rail" aria-label="Scene tools">
        <button type="button" title="Reset camera" onClick={() => issueCameraCommand({ type: 'reset' })}>
          <RotateCcw size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Focus selection"
          onClick={() => {
            if (inspectedEdge) focusEdge(inspectedEdge);
            else focusNode(inspectedNode);
          }}
        >
          <Focus size={17} aria-hidden="true" />
        </button>
        {sideRailActions}
        {showNavigationControls ? (
          <div className="nav-pad" aria-label="Space navigation">
            <button type="button" title="Move up" onClick={() => moveCamera('up')}>
              <ChevronUp size={15} aria-hidden="true" />
            </button>
            <button type="button" title="Move forward" onClick={() => moveCamera('forward')}>
              <ArrowUp size={15} aria-hidden="true" />
            </button>
            <button type="button" title="Move left" onClick={() => moveCamera('left')}>
              <ArrowLeft size={15} aria-hidden="true" />
            </button>
            <button type="button" title="Move right" onClick={() => moveCamera('right')}>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
            <button type="button" title="Move backward" onClick={() => moveCamera('back')}>
              <ArrowDown size={15} aria-hidden="true" />
            </button>
            <button type="button" title="Move down" onClick={() => moveCamera('down')}>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </aside>

      {(options?.showLegend ?? true) && legend ? <div className="legend">{legend}</div> : null}

      {showDetailPanel && inspectedNode ? (
        <aside className="detail-panel">
          {renderNodeDetail ? (
            renderNodeDetail(inspectedNode)
          ) : (
            <>
              <div className="detail-heading">
                <Radar size={18} aria-hidden="true" />
                <div>
                  {inspectedNode.group ? <span>{inspectedNode.group}</span> : null}
                  <h2>{inspectedNode.label ?? inspectedNode.id}</h2>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Node id</dt>
                  <dd>{inspectedNode.id}</dd>
                </div>
                {inspectedNode.group ? (
                  <div>
                    <dt>Group</dt>
                    <dd>{inspectedNode.group}</dd>
                  </div>
                ) : null}
                {inspectedNode.size !== undefined ? (
                  <div>
                    <dt>Size</dt>
                    <dd>{inspectedNode.size.toFixed(1)}</dd>
                  </div>
                ) : null}
              </dl>
            </>
          )}
          <button type="button" onClick={() => focusNode(inspectedNode)}>
            <Upload size={15} aria-hidden="true" />
            Navigate
          </button>
        </aside>
      ) : null}

      {showDetailPanel && inspectedEdge && sourceEndpoint && targetEndpoint ? (
        <aside className="detail-panel connection-panel">
          {renderEdgeDetail ? (
            renderEdgeDetail(inspectedEdge, { source: sourceEndpoint, target: targetEndpoint })
          ) : (
            <>
              <div className="detail-heading">
                <GitBranch size={18} aria-hidden="true" />
                <div>
                  <span>{inspectedEdge.kind ?? 'relationship'}</span>
                  <h2>
                    {sourceEndpoint.label} <small>to</small> {targetEndpoint.label}
                  </h2>
                </div>
              </div>
              <div className="score-line">
                <strong>{Math.round((inspectedEdge.weight ?? 0.5) * 100)}%</strong>
                <span>STRENGTH</span>
              </div>
              <dl>
                <div>
                  <dt>Relationship id</dt>
                  <dd>{displayEdgeId(inspectedEdge)}</dd>
                </div>
                {sourceEndpoint.group ? (
                  <div>
                    <dt>Source</dt>
                    <dd>{sourceEndpoint.group}</dd>
                  </div>
                ) : null}
                {targetEndpoint.group ? (
                  <div>
                    <dt>Target</dt>
                    <dd>{targetEndpoint.group}</dd>
                  </div>
                ) : null}
              </dl>
            </>
          )}
          <div className="detail-actions">
            <button type="button" onClick={() => focusEdge(inspectedEdge)}>
              <Navigation size={15} aria-hidden="true" />
              Trace link
            </button>
            {sourceEndpoint.node ? (
              <button type="button" onClick={() => focusNode(sourceEndpoint.node)}>
                Source
              </button>
            ) : null}
            {targetEndpoint.node ? (
              <button type="button" onClick={() => focusNode(targetEndpoint.node)}>
                Target
              </button>
            ) : null}
          </div>
        </aside>
      ) : null}
    </main>
  );
}
