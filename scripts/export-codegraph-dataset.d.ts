import type { DatabaseSync } from 'node:sqlite';
import type { GraphDataset } from '../src/domain/types';

export interface CodeGraphExportFilters {
  edgeKinds?: Set<string> | null;
  nodeKinds?: Set<string> | null;
}

declare module './export-codegraph-dataset.mjs' {
  export interface CodeGraphExportFilters {
    edgeKinds?: Set<string> | null;
    nodeKinds?: Set<string> | null;
  }

  export function buildCodeGraphDataset(
    db: DatabaseSync,
    filters?: CodeGraphExportFilters,
  ): GraphDataset;
}
