'use client';

import { useMemo } from 'react';
import { GalaxyGraphVisualizer } from 'galaxy-nodes';
import {
  createInitiativeAccessors,
  generateGalaxyDataset,
  INITIATIVE_CATEGORIES,
  renderInitiativeEdgeDetail,
  renderInitiativeNodeDetail,
} from 'galaxy-nodes/presets/initiatives';

export default function GalaxyClient() {
  const dataset = useMemo(() => generateGalaxyDataset(10_000), []);
  const accessors = useMemo(() => createInitiativeAccessors({ sharpMoney: true }), []);

  return (
    <GalaxyGraphVisualizer
      accessors={accessors}
      dataset={dataset}
      groups={INITIATIVE_CATEGORIES}
      renderEdgeDetail={renderInitiativeEdgeDetail}
      renderNodeDetail={renderInitiativeNodeDetail}
      options={{
        showDatasetSizeControls: false,
      }}
    />
  );
}
