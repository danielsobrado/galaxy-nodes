import {
  createInitiativeAccessors,
  formatInitiativeMoney,
  INITIATIVE_CATEGORIES,
  type InitiativeAccessorOptions,
} from './initiatives/core';

export { CATEGORY_COLORS, DATASET_SIZES, generateGalaxyDataset, INITIATIVE_CATEGORIES } from './initiatives/core';
export type {
  DatasetSize,
  InitiativeCategory as Category,
  InitiativeCluster as MarketCluster,
  InitiativeClusterMeta as MarketClusterMeta,
  InitiativeDataset as MarketDataset,
  InitiativeMetrics as MarketMetrics,
  InitiativeNode as MarketNode,
  InitiativeNodeMeta as MarketNodeMeta,
  InitiativeSentiment as Sentiment,
} from './initiatives/core';

/** @deprecated Use `INITIATIVE_CATEGORIES` from `galaxy-nodes/presets/initiatives` instead. */
export const MARKET_CATEGORIES = INITIATIVE_CATEGORIES;

/** @deprecated Use `createInitiativeAccessors` from `galaxy-nodes/presets/initiatives` instead. */
export const createMarketAccessors = createInitiativeAccessors;

/** @deprecated Use `formatInitiativeMoney` from `galaxy-nodes/presets/initiatives` instead. */
export const formatMarketMoney = formatInitiativeMoney;

/** @deprecated Use `InitiativeAccessorOptions` from `galaxy-nodes/presets/initiatives` instead. */
export type MarketAccessorOptions = InitiativeAccessorOptions;
