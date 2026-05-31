import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
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
import { type DatasetSize, DATASET_SIZES, formatCompactNumber, generateGalaxyDataset, getEdgeId } from './data';
import { CATEGORIES, type Category, type GraphDataset, type GraphEdge, type GraphNode, type SpaceDirection } from './types';

export interface GalaxyGraphVisualizerOptions {
  categories?: readonly Category[];
  datasetSizes?: readonly DatasetSize[];
  galaxyMode?: boolean;
  sharpMoney?: boolean;
  showCategoryNav?: boolean;
  showClusters?: boolean;
  showControls?: boolean;
  showDatasetSizeControls?: boolean;
  showDetailPanel?: boolean;
  showLegend?: boolean;
  showNavigationControls?: boolean;
  showSearch?: boolean;
  showStats?: boolean;
  showTimeline?: boolean;
}

export interface GalaxyGraphVisualizerProps {
  brandLabel?: string;
  className?: string;
  dataset: GraphDataset;
  initialCategory?: Category;
  onCategoryChange?: (category: Category) => void;
  onDatasetChange?: (dataset: GraphDataset) => void;
  onHoverEdge?: (edge: GraphEdge | null) => void;
  onHoverNode?: (node: GraphNode | null) => void;
  onNavigate?: (command: CameraCommand) => void;
  onSelectEdge?: (edge: GraphEdge | null) => void;
  onSelectNode?: (node: GraphNode | null) => void;
  options?: GalaxyGraphVisualizerOptions;
  selectedEdgeId?: string | null;
  selectedNodeId?: string | null;
  sideRailActions?: ReactNode;
  theme?: GalaxyGraphTheme;
}

function formatMoney(value: number) {
  return `$${formatCompactNumber(value)}`;
}

function findBestMatch(dataset: GraphDataset, query: string, activeCategory: Category) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  return (
    dataset.nodes.find((node) => {
      if (activeCategory !== 'All' && node.category !== activeCategory) return false;
      return node.label.toLowerCase().includes(normalized) || node.id.toLowerCase() === normalized;
    }) ?? null
  );
}

function findEndpoint(dataset: GraphDataset, id: string) {
  const node = dataset.nodes.find((entry) => entry.id === id);
  if (node) {
    return {
      category: node.category,
      id: node.id,
      isNode: true,
      label: node.label,
      node,
    };
  }

  const cluster = dataset.clusters.find((entry) => entry.id === id);
  if (cluster) {
    return {
      category: cluster.category,
      id: cluster.id,
      isNode: false,
      label: cluster.label,
      node: null,
    };
  }

  return {
    category: 'Other' as const,
    id,
    isNode: false,
    label: id,
    node: null,
  };
}

function edgeDisplayId(dataset: GraphDataset, edge: GraphEdge) {
  return getEdgeId(edge, dataset.edges.indexOf(edge));
}

function themeStyle(theme: GalaxyGraphTheme | undefined) {
  return {
    '--gn-bg': theme?.background,
    '--gn-no': theme?.noColor,
    '--gn-panel-accent': theme?.panelAccentColor,
    '--gn-selected': theme?.selectedColor,
    '--gn-yes': theme?.yesColor,
  } as CSSProperties;
}

export default function GalaxyGraphVisualizer({
  brandLabel = 'Galaxy Nodes',
  className,
  dataset,
  initialCategory = 'All',
  onCategoryChange,
  onDatasetChange,
  onHoverEdge,
  onHoverNode,
  onNavigate,
  onSelectEdge,
  onSelectNode,
  options,
  selectedEdgeId,
  selectedNodeId,
  sideRailActions,
  theme,
}: GalaxyGraphVisualizerProps) {
  const [activeCategory, setActiveCategory] = useState<Category>(initialCategory);
  const [showClusters, setShowClusters] = useState(options?.showClusters ?? true);
  const [galaxyMode, setGalaxyMode] = useState(options?.galaxyMode ?? true);
  const [sharpMoney, setSharpMoney] = useState(options?.sharpMoney ?? true);
  const [playing, setPlaying] = useState(true);
  const [timeline, setTimeline] = useState(72);
  const [search, setSearch] = useState('');
  const [internalSelectedNode, setInternalSelectedNode] = useState<GraphNode | null>(null);
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [internalSelectedEdge, setInternalSelectedEdge] = useState<GraphEdge | null>(null);
  const [hoverEdge, setHoverEdge] = useState<GraphEdge | null>(null);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null);

  const categories = options?.categories ?? CATEGORIES;
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

  useEffect(() => {
    if (options?.sharpMoney !== undefined) setSharpMoney(options.sharpMoney);
  }, [options?.sharpMoney]);

  const categoryNodes = useMemo(() => {
    if (activeCategory === 'All') return dataset.nodes;
    return dataset.nodes.filter((node) => node.category === activeCategory);
  }, [activeCategory, dataset.nodes]);

  const endpointCategories = useMemo(() => {
    const values = new Map<string, Category>();
    dataset.nodes.forEach((node) => values.set(node.id, node.category));
    dataset.clusters.forEach((cluster) => values.set(cluster.id, cluster.category));
    return values;
  }, [dataset.clusters, dataset.nodes]);

  const categoryEdges = useMemo(() => {
    if (activeCategory === 'All') return dataset.edges;
    return dataset.edges.filter(
      (edge) => endpointCategories.get(edge.source) === activeCategory || endpointCategories.get(edge.target) === activeCategory,
    );
  }, [activeCategory, dataset.edges, endpointCategories]);

  const selectedNode = useMemo(() => {
    if (selectedNodeId !== undefined) return dataset.nodes.find((node) => node.id === selectedNodeId) ?? null;
    return internalSelectedNode && dataset.nodes.includes(internalSelectedNode) ? internalSelectedNode : null;
  }, [dataset.nodes, internalSelectedNode, selectedNodeId]);

  const selectedEdge = useMemo(() => {
    if (selectedEdgeId !== undefined) return dataset.edges.find((edge) => edgeDisplayId(dataset, edge) === selectedEdgeId) ?? null;
    return internalSelectedEdge && dataset.edges.includes(internalSelectedEdge) ? internalSelectedEdge : null;
  }, [dataset, internalSelectedEdge, selectedEdgeId]);

  const stats = useMemo(() => {
    const markets = new Set(categoryNodes.map((node) => node.category)).size;
    const positions = categoryNodes.reduce((sum, node) => sum + node.metrics.activeTraders, 0);
    const major = categoryNodes.filter((node) => node.isMajor).length;
    return {
      connections: categoryEdges.length,
      major,
      markets,
      nodes: categoryNodes.length,
      positions,
    };
  }, [categoryEdges.length, categoryNodes]);

  const issueCameraCommand = useCallback(
    (command: Omit<CameraCommand, 'nonce'>) => {
      const nextCommand = { ...command, nonce: Date.now() } as CameraCommand;
      setCameraCommand(nextCommand);
      onNavigate?.(nextCommand);
    },
    [onNavigate],
  );

  const selectNode = useCallback(
    (node: GraphNode | null) => {
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
    (node: GraphNode | null) => {
      setHoverNode(node);
      onHoverNode?.(node);
    },
    [onHoverNode],
  );

  const selectEdge = useCallback(
    (edge: GraphEdge | null) => {
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
    (edge: GraphEdge | null) => {
      setHoverEdge(edge);
      onHoverEdge?.(edge);
    },
    [onHoverEdge],
  );

  function chooseCategory(category: Category) {
    setActiveCategory(category);
    if (selectedNodeId === undefined) setInternalSelectedNode(null);
    else if (selectedNodeId !== null) onSelectNode?.(null);
    if (selectedEdgeId === undefined) setInternalSelectedEdge(null);
    else if (selectedEdgeId !== null) onSelectEdge?.(null);
    onCategoryChange?.(category);
  }

  function updateDatasetSize(size: DatasetSize) {
    onDatasetChange?.(generateGalaxyDataset(size));
    if (selectedNodeId === undefined) setInternalSelectedNode(null);
    else if (selectedNodeId !== null) onSelectNode?.(null);
    setHoverNode(null);
    if (selectedEdgeId === undefined) setInternalSelectedEdge(null);
    else if (selectedEdgeId !== null) onSelectEdge?.(null);
    setHoverEdge(null);
  }

  function focusNode(node: GraphNode | null) {
    if (!node) return;
    selectNode(node);
    issueCameraCommand({ nodeId: node.id, type: 'focus' });
  }

  function focusEdge(edge: GraphEdge | null) {
    if (!edge) return;
    selectEdge(edge);
    issueCameraCommand({ edgeId: edgeDisplayId(dataset, edge), type: 'focus-edge' });
  }

  function moveCamera(direction: SpaceDirection) {
    issueCameraCommand({ direction, type: 'move' });
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    focusNode(findBestMatch(dataset, search, activeCategory));
  }

  const inspectedNode = selectedNode ?? (selectedEdge ? null : hoverNode);
  const inspectedEdge = selectedNode ? null : selectedEdge ?? (!inspectedNode ? hoverEdge : null);
  const currentSelectedNodeId = selectedNode?.id ?? null;
  const currentSelectedEdgeId = currentSelectedNodeId || !selectedEdge ? null : edgeDisplayId(dataset, selectedEdge);
  const sourceEndpoint = inspectedEdge ? findEndpoint(dataset, inspectedEdge.source) : null;
  const targetEndpoint = inspectedEdge ? findEndpoint(dataset, inspectedEdge.target) : null;

  return (
    <main className={['app-shell', 'galaxy-nodes-shell', className].filter(Boolean).join(' ')} style={themeStyle(theme)}>
      <GalaxyScene
        dataset={dataset}
        activeCategory={activeCategory}
        showClusters={showClusters}
        galaxyMode={galaxyMode}
        sharpMoney={sharpMoney}
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
        {(options?.showCategoryNav ?? true) ? (
          <nav className="category-nav" aria-label="Categories">
            {categories.map((category) => (
              <button key={category} className={category === activeCategory ? 'is-active' : ''} type="button" onClick={() => chooseCategory(category)}>
                {category}
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
            <button type="button" className={sharpMoney ? 'toggle is-on' : 'toggle'} onClick={() => setSharpMoney((value) => !value)}>
              <Activity size={15} aria-hidden="true" />
              Sharp flow <span>{sharpMoney ? 'ON' : 'OFF'}</span>
            </button>
            <button type="button" className={showClusters ? 'toggle is-on' : 'toggle'} onClick={() => setShowClusters((value) => !value)}>
              <Layers3 size={15} aria-hidden="true" />
              Clusters <span>{showClusters ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          {(options?.showTimeline ?? true) ? (
            <div className="playback">
              <button type="button" className="icon-button" onClick={() => setPlaying((value) => !value)} title="Play or pause">
                {playing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
              </button>
              <span>0.5x</span>
              <b>1x</b>
              <span>2x</span>
              <input type="range" min="0" max="100" value={timeline} onChange={(event) => setTimeline(Number(event.target.value))} aria-label="Timeline" />
            </div>
          ) : null}

          <div className="live">
            <span />
            LIVE
          </div>

          {showStats ? (
            <div className="stats">
              <span>
                <b>{stats.markets}</b> markets
              </span>
              <span>
                <b>{formatCompactNumber(stats.nodes)}</b> nodes
              </span>
              <span>
                <b>{formatCompactNumber(stats.positions)}</b> positions
              </span>
              <span>
                <b>{stats.major}</b> planets
              </span>
              <span>
                <b>{stats.connections}</b> links
              </span>
            </div>
          ) : null}

          {showDatasetSizeControls && options?.datasetSizes?.length && onDatasetChange ? (
            <div className="segmented" aria-label="Dataset size">
              {options.datasetSizes.map((size) => (
                <button key={size} type="button" className={dataset.nodes.length === size ? 'is-active' : ''} onClick={() => updateDatasetSize(size)}>
                  {formatCompactNumber(size)}
                </button>
              ))}
            </div>
          ) : null}

          <button type="button" className={galaxyMode ? 'pill-button is-active' : 'pill-button'} onClick={() => setGalaxyMode((value) => !value)}>
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

      {(options?.showLegend ?? true) ? (
        <div className="legend">
          <span>Position</span>
          <b className="yes">Above = YES</b>
          <b className="no">Below = NO</b>
          <span>Color = category / sentiment</span>
        </div>
      ) : null}

      {showDetailPanel && inspectedNode ? (
        <aside className="detail-panel">
          <div className="detail-heading">
            <Radar size={18} aria-hidden="true" />
            <div>
              <span>{inspectedNode.category}</span>
              <h2>{inspectedNode.label}</h2>
            </div>
          </div>
          <div className="score-line">
            <strong>{Math.round(inspectedNode.score)}%</strong>
            <span>{inspectedNode.sentiment.toUpperCase()}</span>
          </div>
          <dl>
            <div>
              <dt>24h volume</dt>
              <dd>{formatMoney(inspectedNode.metrics.volume)}</dd>
            </div>
            <div>
              <dt>Active traders</dt>
              <dd>{formatCompactNumber(inspectedNode.metrics.activeTraders)}</dd>
            </div>
            <div>
              <dt>Market price</dt>
              <dd>{inspectedNode.metrics.marketPrice.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>Win rate</dt>
              <dd>{inspectedNode.metrics.winRate.toFixed(1)}%</dd>
            </div>
          </dl>
          <button type="button" onClick={() => focusNode(inspectedNode)}>
            <Upload size={15} aria-hidden="true" />
            Navigate
          </button>
        </aside>
      ) : null}

      {showDetailPanel && inspectedEdge && sourceEndpoint && targetEndpoint ? (
        <aside className="detail-panel connection-panel">
          <div className="detail-heading">
            <GitBranch size={18} aria-hidden="true" />
            <div>
              <span>{inspectedEdge.kind} relationship</span>
              <h2>
                {sourceEndpoint.label} <small>to</small> {targetEndpoint.label}
              </h2>
            </div>
          </div>
          <div className="score-line">
            <strong>{Math.round(inspectedEdge.weight * 100)}%</strong>
            <span>STRENGTH</span>
          </div>
          <dl>
            <div>
              <dt>Relationship id</dt>
              <dd>{edgeDisplayId(dataset, inspectedEdge)}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{sourceEndpoint.category}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{targetEndpoint.category}</dd>
            </div>
            <div>
              <dt>Flow estimate</dt>
              <dd>{formatMoney(((sourceEndpoint.node?.metrics.volume ?? 8_000_000) + (targetEndpoint.node?.metrics.volume ?? 8_000_000)) * inspectedEdge.weight * 0.5)}</dd>
            </div>
          </dl>
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
