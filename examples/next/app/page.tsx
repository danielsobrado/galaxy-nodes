import GraphClient from './GraphClient';
import type { GraphDataset } from 'galaxy-nodes';

const dataset: GraphDataset = {
  nodes: [
    { id: 'api', label: 'API', group: 'Platform', major: true, size: 8 },
    { id: 'queue', label: 'Queue', group: 'Platform', size: 4 },
    { id: 'billing', label: 'Billing', group: 'Product', major: true, size: 7 },
  ],
  edges: [
    { source: 'api', target: 'queue', kind: 'publishes', weight: 0.7 },
    { source: 'queue', target: 'billing', kind: 'feeds', weight: 0.82 },
  ],
};

export default function Page() {
  return <GraphClient dataset={dataset} />;
}
