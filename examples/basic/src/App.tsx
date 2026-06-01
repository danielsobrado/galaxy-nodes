import { useMemo, useRef, useState } from 'react';
import { Activity, Database, Import } from 'lucide-react';
import {
  GalaxyGraphVisualizer,
  getEdgeId,
  parseGraphDataset,
  type GraphDataset,
  type GraphDatasetPatch,
  type LargeGraphExpandRequest,
  type LargeGraphOptions,
} from 'galaxy-nodes';
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

const initiativeLegend = (
  <>
    <span>Color</span>
    <b className="yes">ON TRACK</b>
    <b className="no">AT RISK</b>
    <span>by business status / function</span>
  </>
);

const INITIAL_DATASET_SIZE = DATASET_SIZES[0];

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
  const [dataset, setDataset] = useState<GraphDataset<InitiativeNodeMeta, unknown, InitiativeClusterMeta>>(() =>
    generateGalaxyDataset(INITIAL_DATASET_SIZE),
  );
  const [sharpMoney, setSharpMoney] = useState(true);
  const [dbStatus, setDbStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamChunkRef = useRef(0);

  // Memoize so parent renders do not force redundant color/size buffer refreshes.
  const accessors = useMemo(() => createInitiativeAccessors({ sharpMoney }), [sharpMoney]);
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
  const largeGraph = useMemo<LargeGraphOptions<InitiativeNodeMeta, unknown, InitiativeClusterMeta>>(
    () => ({
      // Always enabled so the progressive "load more" controls are available out of the
      // box. When the Memgraph API is connected we stream real neighborhoods; otherwise
      // we synthesize chunks locally — either way the library appends them in place.
      enabled: true,
      // Keep the merged edge set untrimmed so appended chunks always extend the existing
      // prefix and take the in-place append path (rather than a budget-trim rebuild).
      edgeBudget: 20_000,
      async expandGraph(
        request: LargeGraphExpandRequest,
        signal: AbortSignal,
      ): Promise<GraphDatasetPatch<InitiativeNodeMeta, unknown, InitiativeClusterMeta>> {
        if (dbStatus !== 'loaded') {
          // Simulate streaming latency so the loading state and incremental append are
          // visible, then hand back a locally synthesized chunk.
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
        // Offline demo nodes/edges carry their detail in `meta`, so only the API-backed
        // graph needs a remote fetch.
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
    }),
    [apiBase, dbStatus, fetchGraphApi],
  );

  async function importDataset(file: File) {
    setDataset(parseGraphDataset<InitiativeNodeMeta, unknown, InitiativeClusterMeta>(JSON.parse(await file.text())));
    setDbStatus('idle');
  }

  async function loadDatabaseGraph() {
    setDbStatus('loading');
    try {
      const response = await fetchGraphApi(`${apiBase}/graph`);
      if (!response.ok) throw new Error(`Graph API returned ${response.status}`);
      setDataset(parseGraphDataset<InitiativeNodeMeta, unknown, InitiativeClusterMeta>(await response.json()));
      setDbStatus('loaded');
    } catch {
      setDbStatus('error');
    }
  }

  return (
    <GalaxyGraphVisualizer
      dataset={dataset}
      accessors={accessors}
      groups={INITIATIVE_CATEGORIES}
      legend={initiativeLegend}
      renderNodeDetail={renderInitiativeNodeDetail}
      renderEdgeDetail={renderInitiativeEdgeDetail}
      largeGraph={largeGraph}
      onDatasetSizeChange={(size) => setDataset(generateGalaxyDataset(size))}
      options={{
        datasetSizes: DATASET_SIZES,
        showDatasetSizeControls: true,
      }}
      controlActions={
        <button
          type="button"
          className={sharpMoney ? 'toggle is-on' : 'toggle'}
          aria-pressed={sharpMoney}
          onClick={() => setSharpMoney((value) => !value)}
        >
          <Activity size={15} aria-hidden="true" />
          Status focus <span>{sharpMoney ? 'ON' : 'OFF'}</span>
        </button>
      }
      sideRailActions={
        <>
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
      }
    />
  );
}
