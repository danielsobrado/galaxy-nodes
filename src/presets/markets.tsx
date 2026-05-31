import type { ReactNode } from 'react';
import { GitBranch, Radar } from 'lucide-react';
import { formatCompactNumber, getEdgeId } from '../data';
import type { EdgeEndpoint, GraphEdge, GraphNode } from '../types';
import { formatMarketMoney, type MarketNodeMeta } from './markets-core';

export * from './markets-core';

function nodeMeta(node: GraphNode<MarketNodeMeta> | null): MarketNodeMeta | undefined {
  return node?.meta;
}

function formatStatus(status: MarketNodeMeta['sentiment']) {
  return status.replace('-', ' ').toUpperCase();
}

/** Rich node detail-panel body for the corporate demo preset. */
export function renderMarketNodeDetail(node: GraphNode<MarketNodeMeta>): ReactNode {
  const meta = nodeMeta(node);
  if (!meta) return null;
  return (
    <>
      <div className="detail-heading">
        <Radar size={18} aria-hidden="true" />
        <div>
          <span>{meta.category}</span>
          <h2>{node.label ?? node.id}</h2>
        </div>
      </div>
      <div className="score-line">
        <strong>{Math.round(meta.score)}%</strong>
        <span>{formatStatus(meta.sentiment)}</span>
      </div>
      <dl>
        <div>
          <dt>Annual impact</dt>
          <dd>{formatMarketMoney(meta.metrics.annualImpact)}</dd>
        </div>
        <div>
          <dt>Stakeholders</dt>
          <dd>{formatCompactNumber(meta.metrics.stakeholders)}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{meta.metrics.confidence.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>Delivery rate</dt>
          <dd>{meta.metrics.deliveryRate.toFixed(1)}%</dd>
        </div>
      </dl>
    </>
  );
}

/** Rich edge detail-panel body for the corporate demo preset. */
export function renderMarketEdgeDetail(
  edge: GraphEdge,
  endpoints: { source: EdgeEndpoint<MarketNodeMeta>; target: EdgeEndpoint<MarketNodeMeta> },
): ReactNode {
  const { source, target } = endpoints;
  const sourceImpact = nodeMeta(source.node)?.metrics.annualImpact ?? 8_000_000;
  const targetImpact = nodeMeta(target.node)?.metrics.annualImpact ?? 8_000_000;
  const impact = (sourceImpact + targetImpact) * (edge.weight ?? 0.5) * 0.5;

  return (
    <>
      <div className="detail-heading">
        <GitBranch size={18} aria-hidden="true" />
        <div>
          <span>{edge.kind ?? 'relationship'} relationship</span>
          <h2>
            {source.label} <small>to</small> {target.label}
          </h2>
        </div>
      </div>
      <div className="score-line">
        <strong>{Math.round((edge.weight ?? 0.5) * 100)}%</strong>
        <span>STRENGTH</span>
      </div>
      <dl>
        <div>
          <dt>Relationship id</dt>
          <dd>{getEdgeId(edge)}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{source.group ?? '-'}</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>{target.group ?? '-'}</dd>
        </div>
        <div>
          <dt>Impact estimate</dt>
          <dd>{formatMarketMoney(impact)}</dd>
        </div>
      </dl>
    </>
  );
}
