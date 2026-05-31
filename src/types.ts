export type Category =
  | 'All'
  | 'Crypto'
  | 'Politics'
  | 'Geopolitics'
  | 'Finance'
  | 'Tech'
  | 'Sports'
  | 'Culture'
  | 'Social'
  | 'Other';

export type Sentiment = 'yes' | 'no' | 'mixed';

export type SpaceDirection = 'forward' | 'back' | 'left' | 'right' | 'up' | 'down';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GraphMetrics {
  volume: number;
  activeTraders: number;
  marketPrice: number;
  winRate: number;
}

export interface GraphNode {
  id: string;
  label: string;
  category: Exclude<Category, 'All'>;
  clusterId: string;
  position: Vec3;
  size: number;
  score: number;
  sentiment: Sentiment;
  metrics: GraphMetrics;
  isMajor: boolean;
}

export interface GraphEdge {
  id?: string;
  source: string;
  target: string;
  weight: number;
  kind: 'filament' | 'trade' | 'signal';
}

export interface GraphCluster {
  id: string;
  label: string;
  category: Exclude<Category, 'All'>;
  center: Vec3;
  radius: number;
  nodeCount: number;
  score: number;
}

export interface GraphDataset {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  generatedAt: string;
}

export const CATEGORIES: Category[] = [
  'All',
  'Crypto',
  'Politics',
  'Geopolitics',
  'Finance',
  'Tech',
  'Sports',
  'Culture',
  'Social',
  'Other',
];

export const CATEGORY_COLORS: Record<Exclude<Category, 'All'>, string> = {
  Crypto: '#46f4bc',
  Politics: '#ff6c86',
  Geopolitics: '#f2f5f1',
  Finance: '#ff9d66',
  Tech: '#6bd7ff',
  Sports: '#a78bfa',
  Culture: '#f5cf5b',
  Social: '#63e6be',
  Other: '#9ca3af',
};
