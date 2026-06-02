import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CircleDot, Layers3, Pause, Play, Search, Sparkles } from 'lucide-react';
import GalaxyScene from './GalaxyScene';
import { GalaxyDetailPanels } from './GalaxyDetailPanels';
import { GalaxySideRail } from './GalaxySideRail';
import {
  DEFAULT_GRAPH_EDGE_BUDGET,
  formatCompactNumber,
  getEdgeId,
  mergeGraphDataset,
  resolveAccessors,
} from '../domain/data';
import type { CameraCommand } from './GalaxyScene';
import type { GalaxyCameraView, GraphDataset, GraphEdge, GraphNode, SpaceDirection } from '../domain/types';
import {
  DEFAULT_GALAXY_GRAPH_LABELS,
  EMPTY_DETAIL_STATE,
  distinctGroups,
  findBestMatch,
  findEndpoint,
  isInteractiveTarget,
  nodeDisplayText,
  renderDefaultAccessibleSummary,
  themeStyle,
  vectorForDirection,
} from './galaxyGraphVisualizerUtils';
import type {
  AsyncDetailState,
  GalaxyAccessibleSummaryContext,
  GalaxyGraphVisualizerProps,
  GraphStats,
  LargeGraphDetailContext,
  LargeGraphExpandRequest,
} from './galaxyGraphVisualizerTypes';

export type {
  GalaxyAccessibleSummaryContext,
  GalaxyGraphLabels,
  GalaxyGraphVisualizerOptions,
  GalaxyGraphVisualizerProps,
  GraphStats,
  LargeGraphDetailContext,
  LargeGraphExpandRequest,
  LargeGraphOptions,
} from './galaxyGraphVisualizerTypes';

export default function GalaxyGraphVisualizer<NMeta = unknown, EMeta = unknown, CMeta = unknown>({
  accessors,
  brandLabel = 'Galaxy Nodes',
  className,
  controlActions,
  dataset,
  groups,
  initialGroup = null,
  keyLegend,
  legend,
  labels,
  layout,
  largeGraph,
  onContextBudgetExceeded,
  onDatasetSizeChange,
  onGroupChange,
  onHoverEdge,
  onHoverNode,
  onNavigate,
  onSceneFailure,
  onSelectEdge,
  onSelectNode,
  options,
  renderEdgeDetail,
  renderAccessibleSummary,
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
  const [playing, setPlaying] = useState(false);
  const [search, setSearch] = useState('');
  const [internalSelectedNode, setInternalSelectedNode] = useState<GraphNode<NMeta> | null>(null);
  const [hoverNode, setHoverNode] = useState<GraphNode<NMeta> | null>(null);
  const [internalSelectedEdge, setInternalSelectedEdge] = useState<GraphEdge<EMeta> | null>(null);
  const [internalSelectedEdgeId, setInternalSelectedEdgeId] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<GraphEdge<EMeta> | null>(null);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null);
  const [augmentedDataset, setAugmentedDataset] = useState<GraphDataset<NMeta, EMeta, CMeta>>(dataset);
  const [nodeDetail, setNodeDetail] = useState<AsyncDetailState>(EMPTY_DETAIL_STATE);
  const [edgeDetail, setEdgeDetail] = useState<AsyncDetailState>(EMPTY_DETAIL_STATE);
  const [expanding, setExpanding] = useState(false);
  const [expandError, setExpandError] = useState<unknown>(null);
  const [sceneReady, setSceneReady] = useState(true);
  const [liveMessage, setLiveMessage] = useState('');
  const expansionAbortRef = useRef<AbortController | null>(null);
  const cameraViewRef = useRef<GalaxyCameraView | null>(null);
  const cameraCommandNonceRef = useRef(0);
  const accessibleSummaryId = useId();
  const chromeLabels = useMemo(() => ({ ...DEFAULT_GALAXY_GRAPH_LABELS, ...labels }), [labels]);

  const showControls = options?.showControls ?? true;
  const showStats = options?.showStats ?? true;
  const showNavigationControls = options?.showNavigationControls ?? true;
  const showDetailPanel = options?.showDetailPanel ?? true;
  const showDatasetSizeControls = options?.showDatasetSizeControls ?? Boolean(options?.datasetSizes?.length);
  const largeGraphEnabled = Boolean(largeGraph?.enabled);
  const graphDataset = largeGraphEnabled ? augmentedDataset : dataset;
  const edgeBudget = largeGraph?.edgeBudget ?? DEFAULT_GRAPH_EDGE_BUDGET;
  const expandGraph = largeGraph?.expandGraph;
  const loadEdgeDetail = largeGraph?.loadEdgeDetail;
  const loadNodeDetail = largeGraph?.loadNodeDetail;
  const canExpandGraph = largeGraphEnabled && Boolean(expandGraph);
  const resolvedAccessors = useMemo(() => resolveAccessors(accessors), [accessors]);

  useEffect(() => {
    setAugmentedDataset(largeGraphEnabled ? mergeGraphDataset(dataset, {}, { edgeBudget }) : dataset);
    expansionAbortRef.current?.abort();
    setExpandError(null);
    setExpanding(false);
  }, [dataset, edgeBudget, largeGraphEnabled]);

  useEffect(() => {
    return () => {
      expansionAbortRef.current?.abort();
      expansionAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (options?.showClusters !== undefined) setShowClusters(options.showClusters);
  }, [options?.showClusters]);

  useEffect(() => {
    if (options?.galaxyMode !== undefined) setGalaxyMode(options.galaxyMode);
  }, [options?.galaxyMode]);

  const groupList = useMemo(
    () => (groups ? [...groups] : distinctGroups(graphDataset.nodes)),
    [groups, graphDataset.nodes],
  );

  const groupNodes = useMemo(() => {
    if (activeGroup === null) return graphDataset.nodes;
    return graphDataset.nodes.filter((node) => node.group === activeGroup);
  }, [activeGroup, graphDataset.nodes]);

  const endpointGroups = useMemo(() => {
    const values = new Map<string, string | undefined>();
    graphDataset.nodes.forEach((node) => values.set(node.id, node.group));
    (graphDataset.clusters ?? []).forEach((cluster) => values.set(cluster.id, cluster.group));
    return values;
  }, [graphDataset.clusters, graphDataset.nodes]);

  // Precompute edge <-> display-id maps once per dataset. Resolving ids by
  // scanning dataset.edges with indexOf on every lookup was O(n^2).
  const { edgeDisplayIds, edgeByDisplayId } = useMemo(() => {
    const byEdge = new Map<GraphEdge<EMeta>, string>();
    const byId = new Map<string, GraphEdge<EMeta>>();
    graphDataset.edges.forEach((edge, index) => {
      const id = getEdgeId(edge, index);
      byEdge.set(edge, id);
      byId.set(id, edge);
    });
    return { edgeDisplayIds: byEdge, edgeByDisplayId: byId };
  }, [graphDataset.edges]);

  const displayEdgeId = useCallback(
    (edge: GraphEdge<EMeta>) => edgeDisplayIds.get(edge) ?? getEdgeId(edge),
    [edgeDisplayIds],
  );

  const groupEdges = useMemo(() => {
    if (activeGroup === null) return graphDataset.edges;
    return graphDataset.edges.filter(
      (edge) => endpointGroups.get(edge.source) === activeGroup || endpointGroups.get(edge.target) === activeGroup,
    );
  }, [activeGroup, graphDataset.edges, endpointGroups]);

  const selectedNode = useMemo(() => {
    if (selectedNodeId !== undefined) return graphDataset.nodes.find((node) => node.id === selectedNodeId) ?? null;
    // Resolve the uncontrolled selection by id, not object identity: dataset transforms
    // like mergeGraphDataset (Expand neighbors) produce new node objects, so an identity
    // check would drop the selection and the scene would lose its focus highlight.
    if (!internalSelectedNode) return null;
    return graphDataset.nodes.find((node) => node.id === internalSelectedNode.id) ?? null;
  }, [graphDataset.nodes, internalSelectedNode, selectedNodeId]);

  const selectedEdge = useMemo(() => {
    if (selectedEdgeId !== undefined) return (selectedEdgeId !== null && edgeByDisplayId.get(selectedEdgeId)) || null;
    if (internalSelectedEdgeId) return edgeByDisplayId.get(internalSelectedEdgeId) ?? null;
    if (!internalSelectedEdge) return null;
    // Keep the reference when it survives a dataset change; otherwise re-resolve by id so
    // Expand neighbors does not drop an edge selection.
    if (graphDataset.edges.includes(internalSelectedEdge)) return internalSelectedEdge;
    return edgeByDisplayId.get(getEdgeId(internalSelectedEdge)) ?? null;
  }, [graphDataset.edges, edgeByDisplayId, internalSelectedEdge, internalSelectedEdgeId, selectedEdgeId]);

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

  const accessibleSummaryLimit = Math.max(0, options?.accessibleSummaryLimit ?? 50);
  const accessibleSummaryContext = useMemo<GalaxyAccessibleSummaryContext<NMeta, EMeta, CMeta>>(
    () => ({
      accessors: resolvedAccessors,
      activeGroup,
      dataset: graphDataset,
      edges: groupEdges.slice(0, accessibleSummaryLimit),
      labels: chromeLabels,
      nodes: groupNodes.slice(0, accessibleSummaryLimit),
      stats,
    }),
    [accessibleSummaryLimit, activeGroup, chromeLabels, graphDataset, groupEdges, groupNodes, resolvedAccessors, stats],
  );

  const announceNodeSelection = useCallback(
    (node: GraphNode<NMeta>) => {
      const index =
        Math.max(
          0,
          groupNodes.findIndex((entry) => entry.id === node.id),
        ) + 1;
      setLiveMessage(
        chromeLabels.nodeSelectionAnnouncement(nodeDisplayText(node, resolvedAccessors), index, groupNodes.length),
      );
    },
    [chromeLabels, groupNodes, resolvedAccessors],
  );

  const issueCameraCommand = useCallback(
    (command: Omit<CameraCommand, 'nonce'>) => {
      const nextCommand = { ...command, nonce: (cameraCommandNonceRef.current += 1) } as CameraCommand;
      setCameraCommand(nextCommand);
      onNavigate?.(nextCommand);
    },
    [onNavigate],
  );

  const selectNode = useCallback(
    (node: GraphNode<NMeta> | null) => {
      if (selectedNodeId === undefined) setInternalSelectedNode(node);
      if (node) {
        if (selectedEdgeId === undefined) {
          setInternalSelectedEdge(null);
          setInternalSelectedEdgeId(null);
        }
        if (selectedEdge) onSelectEdge?.(null);
        announceNodeSelection(node);
      }
      onSelectNode?.(node);
    },
    [announceNodeSelection, onSelectEdge, onSelectNode, selectedEdge, selectedEdgeId, selectedNodeId],
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
      if (selectedEdgeId === undefined) {
        setInternalSelectedEdge(edge);
        setInternalSelectedEdgeId(edge ? displayEdgeId(edge) : null);
      }
      if (edge) {
        if (selectedNodeId === undefined) setInternalSelectedNode(null);
        if (selectedNode) onSelectNode?.(null);
      }
      onSelectEdge?.(edge);
    },
    [displayEdgeId, onSelectEdge, onSelectNode, selectedEdgeId, selectedNode, selectedNodeId],
  );

  const hoverConnection = useCallback(
    (edge: GraphEdge<EMeta> | null) => {
      setHoverEdge(edge);
      onHoverEdge?.(edge);
    },
    [onHoverEdge],
  );

  function clearSelection() {
    const shouldNotifyNode = selectedNodeId !== undefined ? selectedNodeId !== null : selectedNode !== null;
    const shouldNotifyEdge = selectedEdgeId !== undefined ? selectedEdgeId !== null : selectedEdge !== null;
    if (selectedNodeId === undefined) setInternalSelectedNode(null);
    if (shouldNotifyNode) onSelectNode?.(null);
    if (selectedEdgeId === undefined) {
      setInternalSelectedEdge(null);
      setInternalSelectedEdgeId(null);
    }
    if (shouldNotifyEdge) onSelectEdge?.(null);
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
    if (!node || !sceneReady) return;
    selectNode(node);
    issueCameraCommand({ nodeId: node.id, type: 'focus' });
  }

  function focusEdge(edge: GraphEdge<EMeta> | null) {
    if (!edge || !sceneReady) return;
    selectEdge(edge);
    issueCameraCommand({ edgeId: displayEdgeId(edge), type: 'focus-edge' });
  }

  function moveCamera(direction: SpaceDirection) {
    if (!sceneReady) return;
    issueCameraCommand({ direction, type: 'move' });
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    focusNode(findBestMatch(graphDataset, search, activeGroup, resolvedAccessors));
  }

  function focusNodeAtIndex(index: number) {
    if (!groupNodes.length) return;
    const clamped = Math.max(0, Math.min(groupNodes.length - 1, index));
    focusNode(groupNodes[clamped]);
  }

  function focusRelativeNode(offset: number) {
    if (!groupNodes.length) return;
    const currentIndex = selectedNode ? groupNodes.findIndex((node) => node.id === selectedNode.id) : -1;
    const fallbackIndex = offset > 0 ? -1 : groupNodes.length;
    const nextIndex = (currentIndex >= 0 ? currentIndex : fallbackIndex) + offset;
    focusNodeAtIndex((nextIndex + groupNodes.length) % groupNodes.length);
  }

  function handleKeyboardTraversal(event: React.KeyboardEvent<HTMLElement>) {
    if (isInteractiveTarget(event.target)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('.galaxy-scene')) return;

    if (event.key === 'PageDown' || event.key === ']' || event.key.toLowerCase() === 'n') {
      event.preventDefault();
      focusRelativeNode(1);
    } else if (event.key === 'PageUp' || event.key === '[' || event.key.toLowerCase() === 'p') {
      event.preventDefault();
      focusRelativeNode(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusNodeAtIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusNodeAtIndex(groupNodes.length - 1);
    } else if (event.key === 'Enter' && selectedNode) {
      event.preventDefault();
      focusNode(selectedNode);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      clearSelection();
      setLiveMessage('');
    }
  }

  const inspectedNode = selectedNode ?? (selectedEdge ? null : hoverNode);
  const inspectedEdge = selectedNode ? null : (selectedEdge ?? (!inspectedNode ? hoverEdge : null));
  const currentSelectedNodeId = selectedNode?.id ?? null;
  const currentSelectedEdgeId = currentSelectedNodeId || !selectedEdge ? null : displayEdgeId(selectedEdge);
  const sourceEndpoint = useMemo(
    () => (inspectedEdge ? findEndpoint(graphDataset, inspectedEdge.source, resolvedAccessors) : null),
    [graphDataset, inspectedEdge, resolvedAccessors],
  );
  const targetEndpoint = useMemo(
    () => (inspectedEdge ? findEndpoint(graphDataset, inspectedEdge.target, resolvedAccessors) : null),
    [graphDataset, inspectedEdge, resolvedAccessors],
  );
  const sceneControlDisabled = !sceneReady;

  const runExpansion = useCallback(
    async (request: Omit<LargeGraphExpandRequest, 'activeGroup' | 'loadedEdgeIds' | 'loadedNodeIds'>) => {
      if (!largeGraphEnabled || !expandGraph) return;
      expansionAbortRef.current?.abort();
      const controller = new AbortController();
      expansionAbortRef.current = controller;
      setExpanding(true);
      setExpandError(null);

      try {
        const patch = await expandGraph(
          {
            ...request,
            activeGroup,
            loadedEdgeIds: graphDataset.edges.map(displayEdgeId),
            loadedNodeIds: graphDataset.nodes.map((node) => node.id),
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setAugmentedDataset((current) => mergeGraphDataset(current, patch, { edgeBudget }));
      } catch (error) {
        if (!controller.signal.aborted) setExpandError(error);
      } finally {
        if (expansionAbortRef.current === controller) expansionAbortRef.current = null;
        if (!controller.signal.aborted) setExpanding(false);
      }
    },
    [activeGroup, displayEdgeId, edgeBudget, expandGraph, graphDataset.edges, graphDataset.nodes, largeGraphEnabled],
  );

  const expandNode = useCallback(
    (node: GraphNode<NMeta> | null) => {
      if (!node) return;
      void runExpansion({ camera: cameraViewRef.current ?? undefined, nodeId: node.id, type: 'node' });
    },
    [runExpansion],
  );

  const expandDirection = useCallback(
    (direction: SpaceDirection) => {
      const cameraView = cameraViewRef.current;
      void runExpansion({
        camera: cameraView ?? undefined,
        direction,
        directionVector: vectorForDirection(cameraView, direction),
        type: 'direction',
      });
    },
    [runExpansion],
  );

  const handleCameraViewChange = useCallback((view: GalaxyCameraView) => {
    cameraViewRef.current = view;
  }, []);

  useEffect(() => {
    if (!largeGraphEnabled || !loadNodeDetail || !selectedNode) {
      setNodeDetail(EMPTY_DETAIL_STATE);
      return undefined;
    }

    const controller = new AbortController();
    const key = selectedNode.id;
    setNodeDetail((current) => ({ ...current, detail: undefined, error: null, key, loading: true }));
    loadNodeDetail(selectedNode, controller.signal).then(
      (detail) => {
        if (!controller.signal.aborted)
          setNodeDetail((current) => ({ ...current, detail, error: null, key, loading: false }));
      },
      (error) => {
        if (!controller.signal.aborted) {
          setNodeDetail((current) => ({ ...current, detail: undefined, error, key, loading: false }));
        }
      },
    );

    return () => controller.abort();
  }, [largeGraphEnabled, loadNodeDetail, nodeDetail.reloadToken, selectedNode]);

  useEffect(() => {
    if (!largeGraphEnabled || !loadEdgeDetail || !selectedEdge || !sourceEndpoint || !targetEndpoint) {
      setEdgeDetail(EMPTY_DETAIL_STATE);
      return undefined;
    }

    const controller = new AbortController();
    const key = currentSelectedEdgeId;
    const endpoints = { source: sourceEndpoint, target: targetEndpoint };
    setEdgeDetail((current) => ({ ...current, detail: undefined, error: null, key, loading: true }));
    loadEdgeDetail(selectedEdge, endpoints, controller.signal).then(
      (detail) => {
        if (!controller.signal.aborted)
          setEdgeDetail((current) => ({ ...current, detail, error: null, key, loading: false }));
      },
      (error) => {
        if (!controller.signal.aborted) {
          setEdgeDetail((current) => ({ ...current, detail: undefined, error, key, loading: false }));
        }
      },
    );

    return () => controller.abort();
  }, [
    currentSelectedEdgeId,
    edgeDetail.reloadToken,
    largeGraphEnabled,
    loadEdgeDetail,
    selectedEdge,
    sourceEndpoint,
    targetEndpoint,
  ]);

  const nodeDetailContext = useMemo<LargeGraphDetailContext | undefined>(() => {
    if (!largeGraphEnabled || inspectedNode !== selectedNode) return undefined;
    return {
      detail: nodeDetail.detail,
      error: nodeDetail.error,
      expand: () => expandNode(inspectedNode),
      loading: nodeDetail.loading,
      reload: () => setNodeDetail((current) => ({ ...current, reloadToken: current.reloadToken + 1 })),
    };
  }, [
    expandNode,
    inspectedNode,
    largeGraphEnabled,
    nodeDetail.detail,
    nodeDetail.error,
    nodeDetail.loading,
    selectedNode,
  ]);

  const edgeDetailContext = useMemo<LargeGraphDetailContext | undefined>(() => {
    if (!largeGraphEnabled || inspectedEdge !== selectedEdge) return undefined;
    return {
      detail: edgeDetail.detail,
      error: edgeDetail.error,
      expand: () => undefined,
      loading: edgeDetail.loading,
      reload: () => setEdgeDetail((current) => ({ ...current, reloadToken: current.reloadToken + 1 })),
    };
  }, [edgeDetail.detail, edgeDetail.error, edgeDetail.loading, inspectedEdge, largeGraphEnabled, selectedEdge]);

  return (
    <main
      className={['galaxy-nodes', className].filter(Boolean).join(' ')}
      style={themeStyle(theme)}
      onKeyDownCapture={handleKeyboardTraversal}
    >
      <GalaxyScene<NMeta, EMeta, CMeta>
        dataset={graphDataset}
        accessibility={{
          describedBy: accessibleSummaryId,
          keyShortcuts: 'PageDown PageUp Home End Enter Escape',
          label: chromeLabels.accessibleGraphLabel,
        }}
        activeGroup={activeGroup}
        showClusters={showClusters}
        galaxyMode={galaxyMode}
        layout={layout}
        contextLimit={options?.webglContextLimit}
        accessors={accessors}
        paused={!playing}
        motionPreference={options?.motionPreference}
        planetSizing={options?.planetSizing}
        expectedSize={options?.expectedSize}
        renderMode={options?.renderMode}
        theme={theme}
        cameraCommand={cameraCommand}
        selectedNodeId={currentSelectedNodeId}
        selectedEdgeId={currentSelectedEdgeId}
        onSceneFailure={(failure) => {
          setSceneReady(false);
          onSceneFailure?.(failure);
        }}
        onSceneReady={() => setSceneReady(true)}
        onCameraViewChange={handleCameraViewChange}
        onContextBudgetExceeded={onContextBudgetExceeded}
        onSelectNode={selectNode}
        onHoverNode={hover}
        onSelectEdge={selectEdge}
        onHoverEdge={hoverConnection}
      />

      <header className="top-bar">
        <div className="brand">
          <CircleDot size={20} aria-hidden="true" />
          <span>{brandLabel}</span>
          <b>{chromeLabels.alphaBadge}</b>
        </div>
        {(options?.showGroupNav ?? true) && groupList.length ? (
          <nav className="category-nav" aria-label={chromeLabels.groupsNav}>
            <button
              className={activeGroup === null ? 'is-active' : ''}
              type="button"
              aria-pressed={activeGroup === null}
              onClick={() => chooseGroup(null)}
            >
              {chromeLabels.allGroups}
            </button>
            {groupList.map((group) => (
              <button
                key={group}
                className={group === activeGroup ? 'is-active' : ''}
                type="button"
                aria-pressed={group === activeGroup}
                onClick={() => chooseGroup(group)}
              >
                {group}
              </button>
            ))}
          </nav>
        ) : null}
        {(options?.showSearch ?? true) ? (
          <form className="search-box" onSubmit={submitSearch}>
            <button type="submit" title={chromeLabels.focusMatchingNode} aria-label={chromeLabels.focusMatchingNode}>
              <Search size={15} aria-hidden="true" />
            </button>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={chromeLabels.searchPlaceholder}
              aria-label={chromeLabels.searchInput}
            />
          </form>
        ) : null}
      </header>

      <section id={accessibleSummaryId} className="visually-hidden" aria-label={chromeLabels.accessibleSummaryHeading}>
        <p>{chromeLabels.traversalHelp}</p>
        {renderAccessibleSummary
          ? renderAccessibleSummary(accessibleSummaryContext)
          : renderDefaultAccessibleSummary(accessibleSummaryContext)}
      </section>
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      {showControls ? (
        <section className="control-ribbon" aria-label={chromeLabels.graphControls}>
          <div className="toggle-row">
            <button
              type="button"
              className={showClusters ? 'toggle is-on' : 'toggle'}
              aria-pressed={showClusters}
              onClick={() => setShowClusters((value) => !value)}
            >
              <Layers3 size={15} aria-hidden="true" />
              {chromeLabels.clusterToggle} <span>{showClusters ? chromeLabels.on : chromeLabels.off}</span>
            </button>
            {controlActions}
          </div>

          {(options?.showTimeline ?? true) ? (
            <div className="playback">
              <button
                type="button"
                className="icon-button"
                onClick={() => setPlaying((value) => !value)}
                title={playing ? chromeLabels.pauseMotion : chromeLabels.playMotion}
                aria-label={playing ? chromeLabels.pauseMotion : chromeLabels.playMotion}
                aria-pressed={playing}
              >
                {playing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
              </button>
              <span>{playing ? chromeLabels.motionOn : chromeLabels.motionOff}</span>
            </div>
          ) : null}

          {showStats ? (
            renderStats ? (
              renderStats(stats)
            ) : (
              <div className="stats">
                <span>{chromeLabels.formatGroupsCount(stats.groups)}</span>
                <span>{chromeLabels.formatNodesCount(stats.nodes)}</span>
                <span>{chromeLabels.formatEdgesCount(stats.edges)}</span>
                <span>{chromeLabels.formatMajorCount(stats.major)}</span>
              </div>
            )
          ) : null}

          {showDatasetSizeControls && options?.datasetSizes?.length && onDatasetSizeChange ? (
            <div className="segmented" aria-label={chromeLabels.datasetSize}>
              {options.datasetSizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={graphDataset.nodes.length === size ? 'is-active' : ''}
                  aria-pressed={graphDataset.nodes.length === size}
                  onClick={() => requestDatasetSize(size)}
                >
                  {formatCompactNumber(size)}
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className={galaxyMode ? 'pill-button is-active' : 'pill-button'}
            aria-pressed={galaxyMode}
            onClick={() => setGalaxyMode((value) => !value)}
          >
            <Sparkles size={15} aria-hidden="true" />
            {chromeLabels.galaxyMode}
          </button>
        </section>
      ) : null}

      <GalaxySideRail<NMeta, EMeta>
        canExpandGraph={canExpandGraph}
        chromeLabels={chromeLabels}
        expandDirection={expandDirection}
        expanding={expanding}
        focusEdge={focusEdge}
        focusNode={focusNode}
        inspectedEdge={inspectedEdge}
        inspectedNode={inspectedNode}
        issueCameraCommand={issueCameraCommand}
        moveCamera={moveCamera}
        sceneControlDisabled={sceneControlDisabled}
        showNavigationControls={showNavigationControls}
        sideRailActions={sideRailActions}
      />

      {(options?.showLegend ?? true) && legend ? <div className="legend">{legend}</div> : null}
      {(options?.showKeyLegend ?? true) && keyLegend ? keyLegend : null}

      <GalaxyDetailPanels<NMeta, EMeta>
        canExpandGraph={canExpandGraph}
        chromeLabels={chromeLabels}
        displayEdgeId={displayEdgeId}
        edgeDetailContext={edgeDetailContext}
        expandError={expandError}
        expandNode={expandNode}
        expanding={expanding}
        focusEdge={focusEdge}
        focusNode={focusNode}
        inspectedEdge={inspectedEdge}
        inspectedNode={inspectedNode}
        largeGraphEnabled={largeGraphEnabled}
        nodeDetailContext={nodeDetailContext}
        renderEdgeDetail={renderEdgeDetail}
        renderNodeDetail={renderNodeDetail}
        resolvedAccessors={resolvedAccessors}
        sceneControlDisabled={sceneControlDisabled}
        showDetailPanel={showDetailPanel}
        sourceEndpoint={sourceEndpoint}
        targetEndpoint={targetEndpoint}
      />
    </main>
  );
}
