import { useMemo, useRef, useState } from 'react';
import { Activity, Database, Import } from 'lucide-react';
import { GalaxyGraphVisualizer, parseGraphDataset, type GraphDataset } from 'galaxy-nodes';
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

export default function App() {
  const graphApiUrl = (import.meta.env.VITE_GRAPH_API_URL as string | undefined) ?? 'http://127.0.0.1:8787';
  const [dataset, setDataset] = useState<GraphDataset<MarketNodeMeta, unknown, MarketClusterMeta>>(() =>
    generateGalaxyDataset(75_000),
  );
  const [sharpMoney, setSharpMoney] = useState(true);
  const [dbStatus, setDbStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Memoize so parent renders do not force redundant color/size buffer refreshes.
  const accessors = useMemo(() => createMarketAccessors({ sharpMoney }), [sharpMoney]);

  async function importDataset(file: File) {
    setDataset(parseGraphDataset<MarketNodeMeta, unknown, MarketClusterMeta>(JSON.parse(await file.text())));
    setDbStatus('idle');
  }

  async function loadDatabaseGraph() {
    setDbStatus('loading');
    try {
      const response = await fetch(`${graphApiUrl.replace(/\/$/, '')}/graph`);
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
