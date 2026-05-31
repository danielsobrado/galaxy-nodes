import { useRef, useState } from 'react';
import { Database, Import } from 'lucide-react';
import {
  DATASET_SIZES,
  GalaxyGraphVisualizer,
  generateGalaxyDataset,
  parseGraphDataset,
  type GraphDataset,
} from 'galaxy-nodes';

export default function App() {
  const graphApiUrl = (import.meta.env.VITE_GRAPH_API_URL as string | undefined) ?? 'http://127.0.0.1:8787';
  const [dataset, setDataset] = useState<GraphDataset>(() => generateGalaxyDataset(75_000));
  const [dbStatus, setDbStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function importDataset(file: File) {
    const imported = parseGraphDataset(JSON.parse(await file.text()));
    setDataset(imported);
    setDbStatus('idle');
  }

  async function loadDatabaseGraph() {
    setDbStatus('loading');
    try {
      const response = await fetch(`${graphApiUrl.replace(/\/$/, '')}/graph`);
      if (!response.ok) throw new Error(`Graph API returned ${response.status}`);
      setDataset(parseGraphDataset(await response.json()));
      setDbStatus('loaded');
    } catch {
      setDbStatus('error');
    }
  }

  return (
    <GalaxyGraphVisualizer
      dataset={dataset}
      onDatasetChange={setDataset}
      options={{
        datasetSizes: DATASET_SIZES,
        showDatasetSizeControls: true,
      }}
      sideRailActions={
        <>
          <button
            type="button"
            className={dbStatus === 'loaded' || dbStatus === 'loading' ? 'is-active' : dbStatus === 'error' ? 'is-error' : ''}
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
