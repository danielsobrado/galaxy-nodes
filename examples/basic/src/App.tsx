import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Activity, Database, FileCode, Import, MousePointerClick } from 'lucide-react';
import {
  GalaxyGraphVisualizer,
  getEdgeId,
  parseGraphDataset,
  type GalaxyGraphThemeInput,
  type GalaxyGraphVisualizerProps,
  type GraphDataset,
  type GraphDatasetPatch,
  type LargeGraphExpandRequest,
  type LargeGraphOptions,
} from 'galaxy-nodes';
import {
  codegraphGroupsFromDataset,
  codegraphLegend,
  createCodeGraphAccessors,
  renderCodeGraphEdgeDetail,
  renderCodeGraphNodeDetail,
  type CodeGraphClusterMeta,
  type CodeGraphEdgeMeta,
  type CodeGraphNodeMeta,
} from 'galaxy-nodes/presets/codegraph';
import {
  createInitiativeAccessors,
  DATASET_SIZES,
  generateGalaxyDataset,
  INITIATIVE_CATEGORIES,
  renderInitiativeEdgeDetail,
  renderInitiativeNodeDetail,
  type InitiativeClusterMeta,
  type InitiativeNodeMeta,
} from 'galaxy-nodes/presets/initiatives';

type DemoMode = 'initiatives' | 'codegraph';

// Mirrors the edge `kind -> color` mapping in createInitiativeAccessors.
const RELATIONSHIP_LEGEND: ReadonlyArray<{ label: string; color: string }> = [
  { label: 'supports', color: '#6bd7ff' },
  { label: 'impacts', color: '#f5cf5b' },
  { label: 'depends on', color: '#ff9d66' },
  { label: 'owned by', color: '#a78bfa' },
  { label: 'blocks', color: '#ff6f86' },
];

const initiativeLegend = (
  <>
    <span>Nodes</span>
    <b className="yes">ON TRACK</b>
    <b className="no">AT RISK</b>
    <span className="legend-sep" aria-hidden="true" />
    <span>Links</span>
    {RELATIONSHIP_LEGEND.map(({ label, color }) => (
      <b key={label} className="rel" style={{ '--rel': color } as CSSProperties}>
        {label}
      </b>
    ))}
  </>
);

// Small overlay explaining the keyboard/mouse navigation the engine supports.
const navKeysBadge = (
  <div className="keys-badge" aria-label="Navigation controls">
    <span>
      <kbd>W</kbd>
      <kbd>A</kbd>
      <kbd>S</kbd>
      <kbd>D</kbd> move
    </span>
    <span>
      <kbd>Q</kbd>
      <kbd>E</kbd> up · down
    </span>
    <span>
      <kbd>Shift</kbd> faster
    </span>
    <span>
      <kbd>drag</kbd> orbit
    </span>
    <span>
      <kbd>scroll</kbd> zoom
    </span>
  </div>
);

const INITIAL_DATASET_SIZE = DATASET_SIZES[0];
const CODEGRAPH_DATASET_URL = `${import.meta.env.BASE_URL}codegraph-dataset.json`;

function graphApiHeaders(token: string | undefined, headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers);
  if (token && !nextHeaders.has('Authorization')) nextHeaders.set('Authorization', `Bearer ${token}`);
  return nextHeaders;
}

const STREAM_CHUNK_NODES = 28;

// Self-contained stand-in for a streaming backend: synthesize one progressive chunk of
// new initiatives anchored to an existing node and returned as a patch. The library
// merges and appends it in place (no full scene rebuild), so `npm run dev` demonstrates
// progressive loading even without the optional Memgraph API running.
function synthesizeExpansionPatch(
  request: LargeGraphExpandRequest,
  chunkId: number,
): GraphDatasetPatch<InitiativeNodeMeta, unknown, InitiativeClusterMeta> {
  const stamp = `stream-${chunkId}`;
  const batch = generateGalaxyDataset(STREAM_CHUNK_NODES);
  const anchorId =
    request.nodeId ??
    (request.loadedNodeIds.length ? request.loadedNodeIds[chunkId % request.loadedNodeIds.length] : batch.nodes[0].id);

  const nodes = batch.nodes.map((node, index) => ({
    ...node,
    id: `${stamp}-${index}`,
    position: undefined, // omit so the built-in layout places appended nodes near their group
    major: index === 0, // surface one planet per chunk so the new cluster is labeled
    group: request.activeGroup ?? node.group,
  }));

  const edges = [
    { id: `${stamp}-anchor`, source: anchorId, target: nodes[0].id, weight: 0.85, kind: 'supports' },
    ...nodes.slice(0, -1).map((node, index) => ({
      id: `${stamp}-link-${index}`,
      source: node.id,
      target: nodes[index + 1].id,
      weight: 0.5,
      kind: 'impacts',
    })),
  ];

  return { nodes, edges };
}

export default function App() {
  const graphApiUrl = (import.meta.env.VITE_GRAPH_API_URL as string | undefined) ?? 'http://127.0.0.1:8787';
  const graphApiToken = import.meta.env.VITE_GRAPH_API_TOKEN as string | undefined;
  const [demoMode, setDemoMode] = useState<DemoMode>('initiatives');
  const [dataset, setDataset] = useState<GraphDataset>(() => generateGalaxyDataset(INITIAL_DATASET_SIZE));
  const [theme, setTheme] = useState<GalaxyGraphThemeInput>('galaxy-dark');
  const [sharpMoney, setSharpMoney] = useState(true);
  const [focusModelEnabled, setFocusModelEnabled] = useState(true);
  const [dbStatus, setDbStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [codegraphStatus, setCodegraphStatus] = useState<'idle' | 'loading' | 'loaded' | 'missing' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamChunkRef = useRef(0);

  const initiativeAccessors = useMemo(() => createInitiativeAccessors({ sharpMoney }), [sharpMoney]);
  const codegraphAccessors = useMemo(() => createCodeGraphAccessors(), []);
  const accessors = demoMode === 'codegraph' ? codegraphAccessors : initiativeAccessors;

  const codegraphGroups = useMemo(() => {
    if (demoMode !== 'codegraph') return [];
    return codegraphGroupsFromDataset(dataset.nodes as GraphDataset<CodeGraphNodeMeta>['nodes']);
  }, [demoMode, dataset.nodes]);

  const apiBase = graphApiUrl.replace(/\/$/, '');
  const fetchGraphApi = useMemo(
    () =>
      (input: string | URL, init: RequestInit = {}) =>
        fetch(input, {
          ...init,
          headers: graphApiHeaders(graphApiToken, init.headers),
        }),
    [graphApiToken],
  );
  const largeGraph = useMemo<LargeGraphOptions | undefined>(() => {
    if (demoMode === 'codegraph') return { enabled: false };
    return {
      enabled: true,
      edgeBudget: 20_000,
      async expandGraph(request: LargeGraphExpandRequest, signal: AbortSignal) {
        if (dbStatus !== 'loaded') {
          await new Promise((resolve) => setTimeout(resolve, 280));
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          streamChunkRef.current += 1;
          return synthesizeExpansionPatch(request, streamChunkRef.current);
        }
        const url = new URL(
          request.type === 'node' && request.nodeId
            ? `${apiBase}/graph/expand/node/${encodeURIComponent(request.nodeId)}`
            : `${apiBase}/graph/expand/direction`,
        );
        url.searchParams.set('limit', '1500');
        url.searchParams.set('edgeLimit', '3000');
        if (request.activeGroup) url.searchParams.set('category', request.activeGroup);
        if (request.type === 'direction' && request.camera && request.directionVector) {
          url.searchParams.set('x', String(request.camera.position.x));
          url.searchParams.set('y', String(request.camera.position.y));
          url.searchParams.set('z', String(request.camera.position.z));
          url.searchParams.set('dx', String(request.directionVector.x));
          url.searchParams.set('dy', String(request.directionVector.y));
          url.searchParams.set('dz', String(request.directionVector.z));
        }

        const response = await fetchGraphApi(url, { signal });
        if (!response.ok) throw new Error(`Graph expansion returned ${response.status}`);
        return (await response.json()) as GraphDatasetPatch<InitiativeNodeMeta, unknown, InitiativeClusterMeta>;
      },
      async loadEdgeDetail(edge, _endpoints, signal) {
        if (dbStatus !== 'loaded') return null;
        const response = await fetchGraphApi(`${apiBase}/graph/edge/${encodeURIComponent(getEdgeId(edge))}/detail`, {
          signal,
        });
        if (!response.ok) throw new Error(`Edge detail returned ${response.status}`);
        return response.json();
      },
      async loadNodeDetail(node, signal) {
        if (dbStatus !== 'loaded') return null;
        const response = await fetchGraphApi(`${apiBase}/graph/node/${encodeURIComponent(node.id)}/detail`, { signal });
        if (!response.ok) throw new Error(`Node detail returned ${response.status}`);
        return response.json();
      },
    };
  }, [apiBase, dbStatus, demoMode, fetchGraphApi]);

  async function importDataset(file: File) {
    setDataset(parseGraphDataset(JSON.parse(await file.text())));
    setDemoMode('initiatives');
    setDbStatus('idle');
    setCodegraphStatus('idle');
  }

  async function loadDatabaseGraph() {
    setDbStatus('loading');
    try {
      const response = await fetchGraphApi(`${apiBase}/graph`);
      if (!response.ok) throw new Error(`Graph API returned ${response.status}`);
      setDataset(parseGraphDataset<InitiativeNodeMeta, unknown, InitiativeClusterMeta>(await response.json()));
      setDemoMode('initiatives');
      setDbStatus('loaded');
      setCodegraphStatus('idle');
    } catch {
      setDbStatus('error');
    }
  }

  async function loadCodeGraphDataset(refresh = false) {
    setCodegraphStatus('loading');
    try {
      const url = refresh ? `${CODEGRAPH_DATASET_URL}?t=${Date.now()}` : CODEGRAPH_DATASET_URL;
      const response = await fetch(url);
      if (response.status === 404) {
        setCodegraphStatus('missing');
        return;
      }
      if (!response.ok) throw new Error(`CodeGraph dataset returned ${response.status}`);
      setDataset(
        parseGraphDataset<CodeGraphNodeMeta, CodeGraphEdgeMeta, CodeGraphClusterMeta>(await response.json()),
      );
      setDemoMode('codegraph');
      setDbStatus('idle');
      setCodegraphStatus('loaded');
    } catch {
      setCodegraphStatus('error');
    }
  }

  const codegraphButtonTitle =
    codegraphStatus === 'missing'
      ? 'CodeGraph dataset not found. Run: codegraph init -i && npm run codegraph:export'
      : codegraphStatus === 'loaded'
        ? 'Reload CodeGraph dataset (re-run npm run codegraph:export after sync)'
        : 'Load CodeGraph dataset for this repository';

  const codegraphRibbonButton = (
    <button
      type="button"
      className={
        codegraphStatus === 'loaded' || codegraphStatus === 'loading'
          ? 'pill-button is-active'
          : codegraphStatus === 'missing' || codegraphStatus === 'error'
            ? 'pill-button is-error'
            : 'pill-button'
      }
      title={codegraphButtonTitle}
      onClick={() => void loadCodeGraphDataset(codegraphStatus === 'loaded')}
    >
      <FileCode size={15} aria-hidden="true" />
      CodeGraph
    </button>
  );

  const visualizerProps = {
    dataset,
    accessors,
    brandLabel: demoMode === 'codegraph' ? 'Galaxy Nodes · CodeGraph' : 'Galaxy Nodes',
    groups: demoMode === 'codegraph' ? codegraphGroups : INITIATIVE_CATEGORIES,
    legend: demoMode === 'codegraph' ? codegraphLegend() : initiativeLegend,
    keyLegend: navKeysBadge,
    renderNodeDetail: demoMode === 'codegraph' ? renderCodeGraphNodeDetail : renderInitiativeNodeDetail,
    renderEdgeDetail: demoMode === 'codegraph' ? renderCodeGraphEdgeDetail : renderInitiativeEdgeDetail,
    largeGraph,
    onDatasetSizeChange:
      demoMode === 'initiatives'
        ? (size: number) => {
            setDataset(generateGalaxyDataset(size));
            setCodegraphStatus('idle');
          }
        : undefined,
    theme,
    onThemeChange: setTheme,
    options: {
      datasetSizes: demoMode === 'initiatives' ? DATASET_SIZES : undefined,
      focusModel: {
        enabled: focusModelEnabled,
        variant: 'fullFocus' as const,
      },
      showDatasetSizeControls: demoMode === 'initiatives',
      showKeyLegend: true,
      showLegend: true,
      showThemeControl: true,
    },
    controlActions: (
      <>
        <button
          type="button"
          className={focusModelEnabled ? 'toggle is-on' : 'toggle'}
          aria-pressed={focusModelEnabled}
          onClick={() => setFocusModelEnabled((value) => !value)}
        >
          <MousePointerClick size={15} aria-hidden="true" />
          Click focus <span>{focusModelEnabled ? 'ON' : 'OFF'}</span>
        </button>
        {demoMode === 'initiatives' ? (
          <button
            type="button"
            className={sharpMoney ? 'toggle is-on' : 'toggle'}
            aria-pressed={sharpMoney}
            onClick={() => setSharpMoney((value) => !value)}
          >
            <Activity size={15} aria-hidden="true" />
            Status focus <span>{sharpMoney ? 'ON' : 'OFF'}</span>
          </button>
        ) : null}
      </>
    ),
    datasetRibbonActions: codegraphRibbonButton,
    sideRailActions: (
      <>
        {demoMode === 'initiatives' ? (
          <button
            type="button"
            className={
              dbStatus === 'loaded' || dbStatus === 'loading' ? 'is-active' : dbStatus === 'error' ? 'is-error' : ''
            }
            title={`Load from Memgraph API (${graphApiUrl})`}
            onClick={() => void loadDatabaseGraph()}
          >
            <Database size={17} aria-hidden="true" />
          </button>
        ) : null}
        <button type="button" title="Import JSON dataset" onClick={() => fileInputRef.current?.click()}>
          <Import size={17} aria-hidden="true" />
        </button>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void importDataset(file);
            event.currentTarget.value = '';
          }}
        />
      </>
    ),
  } as GalaxyGraphVisualizerProps;

  return <GalaxyGraphVisualizer {...visualizerProps} />;
}
