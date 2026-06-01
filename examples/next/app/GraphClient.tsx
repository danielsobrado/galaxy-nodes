'use client';

import { GalaxyGraphVisualizer, type GraphDataset } from 'galaxy-nodes';

export default function GraphClient({ dataset }: { dataset: GraphDataset }) {
  return (
    <div className="next-example-shell">
      <GalaxyGraphVisualizer
        dataset={dataset}
        labels={{
          accessibleGraphLabel: 'Next.js server-rendered graph example',
        }}
        options={{ motionPreference: 'reduced' }}
      />
    </div>
  );
}
