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
  createMarketAccessors,
  DATASET_SIZES,
  generateGalaxyDataset,
  MARKET_CATEGORIES,
  renderMarketEdgeDetail,
  renderMarketNodeDetail,
  type MarketClusterMeta,
  type MarketNodeMeta,
} from 'galaxy-nodes/presets/markets';

const marketLegend = (
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

export default function App() {
  const graphApiUrl = (import.meta.env.VITE_GRAPH_API_URL as string | undefined) ?? 'http://127.0.0.1:8787';
  const graphApiToken = import.meta.env.VITE_GRAPH_API_TOKEN as string | undefined;
  const [dataset, setDataset] = useState<GraphDataset<MarketNodeMeta, unknown, MarketClusterMeta>>(() =>
    generateGalaxyDataset(INITIAL_DATASET_SIZE),
  );
  const [sharpMoney, setSharpMoney] = useState(true);
  const [dbStatus, setDbStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Memoize so parent renders do not force redundant color/size buffer refreshes.
  const accessors = useMemo(() => createMarketAccessors({ sharpMoney }), [sharpMoney]);
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
  const largeGraph = useMemo<LargeGraphOptions<MarketNodeMeta, unknown, MarketClusterMeta>>(
    () => ({
      enabled: dbStatus === 'loaded',
      async expandGraph(
        request: LargeGraphExpandRequest,
        signal: AbortSignal,
      ): Promise<GraphDatasetPatch<MarketNodeMeta, unknown, MarketClusterMeta>> {
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
        return (await response.json()) as GraphDatasetPatch<MarketNodeMeta, unknown, MarketClusterMeta>;
      },
      async loadEdgeDetail(edge, _endpoints, signal) {
        const response = await fetchGraphApi(`${apiBase}/graph/edge/${encodeURIComponent(getEdgeId(edge))}/detail`, {
          signal,
        });
        if (!response.ok) throw new Error(`Edge detail returned ${response.status}`);
        return response.json();
      },
      async loadNodeDetail(node, signal) {
        const response = await fetchGraphApi(`${apiBase}/graph/node/${encodeURIComponent(node.id)}/detail`, { signal });
        if (!response.ok) throw new Error(`Node detail returned ${response.status}`);
        return response.json();
      },
    }),
    [apiBase, dbStatus, fetchGraphApi],
  );

  async function importDataset(file: File) {
    setDataset(parseGraphDataset<MarketNodeMeta, unknown, MarketClusterMeta>(JSON.parse(await file.text())));
    setDbStatus('idle');
  }

  async function loadDatabaseGraph() {
    setDbStatus('loading');
    try {
      const response = await fetchGraphApi(`${apiBase}/graph`);
      if (!response.ok) throw new Error(`Graph API returned ${response.status}`);
      setDataset(parseGraphDataset<MarketNodeMeta, unknown, MarketClusterMeta>(await response.json()));
      setDbStatus('loaded');
    } catch {
      setDbStatus('error');
    }
  }

  return (
    <GalaxyGraphVisualizer
      dataset={dataset}
      accessors={accessors}
      groups={MARKET_CATEGORIES}
      legend={marketLegend}
      renderNodeDetail={renderMarketNodeDetail}
      renderEdgeDetail={renderMarketEdgeDetail}
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
