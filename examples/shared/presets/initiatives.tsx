import type { ReactNode } from 'react';
import { GitBranch, Radar } from 'lucide-react';
import { formatCompactNumber, getEdgeId } from '../../../src/data';
import type { EdgeEndpoint, GraphEdge, GraphNode } from '../../../src/types';
import { formatInitiativeMoney, type InitiativeNodeMeta } from './initiatives/core';

export * from './initiatives/core';

function nodeMeta(node: GraphNode<InitiativeNodeMeta> | null): InitiativeNodeMeta | undefined {
  return node?.meta;
}

function formatStatus(status: InitiativeNodeMeta['sentiment']) {
  return status.replace('-', ' ').toUpperCase();
}

function formatRelationshipKind(kind: GraphEdge['kind']) {
  return (kind ?? 'relationship').replaceAll('_', ' ');
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function degreeSummary(detail: unknown) {
  const degree = record(record(detail)?.degree);
  const incoming = typeof degree?.incoming === 'number' ? degree.incoming : null;
  const outgoing = typeof degree?.outgoing === 'number' ? degree.outgoing : null;
  if (incoming === null || outgoing === null) return null;
  return `${formatCompactNumber(incoming)} in / ${formatCompactNumber(outgoing)} out`;
}

/** Rich node detail-panel body for the corporate initiative demo preset. */
export function renderInitiativeNodeDetail(
  node: GraphNode<InitiativeNodeMeta>,
  context?: { detail: unknown; error: unknown; loading: boolean },
): ReactNode {
  const meta = nodeMeta(node);
  if (!meta) return null;
  const degree = degreeSummary(context?.detail);
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
          <dd>{formatInitiativeMoney(meta.metrics.annualImpact)}</dd>
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
        {context?.loading ? (
          <div>
            <dt>Remote detail</dt>
            <dd>Loading</dd>
          </div>
        ) : null}
        {context?.error ? (
          <div>
            <dt>Remote detail</dt>
            <dd>Unavailable</dd>
          </div>
        ) : null}
        {degree ? (
          <div>
            <dt>Relationships</dt>
            <dd>{degree}</dd>
          </div>
        ) : null}
      </dl>
    </>
  );
}

/** Rich edge detail-panel body for the corporate initiative demo preset. */
export function renderInitiativeEdgeDetail(
  edge: GraphEdge,
  endpoints: { source: EdgeEndpoint<InitiativeNodeMeta>; target: EdgeEndpoint<InitiativeNodeMeta> },
  context?: { error: unknown; loading: boolean },
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
          <span>{formatRelationshipKind(edge.kind)} relationship</span>
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
          <dd>{formatInitiativeMoney(impact)}</dd>
        </div>
        {context?.loading ? (
          <div>
            <dt>Remote detail</dt>
            <dd>Loading</dd>
          </div>
        ) : null}
        {context?.error ? (
          <div>
            <dt>Remote detail</dt>
            <dd>Unavailable</dd>
          </div>
        ) : null}
      </dl>
    </>
  );
}
