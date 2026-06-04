import { useState, type CSSProperties, type ReactNode } from 'react';
import { FileCode, GitBranch } from 'lucide-react';
import { formatCompactNumber, getEdgeId } from '../../../src/domain/data';
import type { EdgeEndpoint, GraphEdge, GraphNode } from '../../../src/domain/types';
import { edgeSceneColorHex, nodeSceneColorHex, type ResolvedGalaxyGraphTheme } from '../../../src/engine/core';
import {
  CODEGRAPH_EDGE_LEGEND,
  CODEGRAPH_NODE_LEGEND,
  formatCodeGraphKind,
  type CodeGraphEdgeMeta,
  type CodeGraphNodeMeta,
} from './codegraph/core';

export * from './codegraph/core';

const DEFAULT_PREVIEW_LENGTH = 48;

function nodeMeta(node: GraphNode<CodeGraphNodeMeta> | null): CodeGraphNodeMeta | undefined {
  return node?.meta;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function pathBasename(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || filePath;
}

function clusterPreview(clusterId: string) {
  const withoutPrefix = clusterId.replace(/^[^:]+:/, '');
  return pathBasename(withoutPrefix);
}

function buildPreview(value: string, previewLength: number, preview?: string) {
  const compact = normalizeText(value);
  if (compact.length <= previewLength) return compact;
  if (preview) return preview.length <= previewLength ? preview : `${preview.slice(0, previewLength)}…`;
  return `${compact.slice(0, previewLength)}…`;
}

function DetailExpandableText({
  value,
  preview,
  previewLength = DEFAULT_PREVIEW_LENGTH,
  scrollWhenExpanded = false,
  mono = true,
}: {
  value: string;
  preview?: string;
  previewLength?: number;
  scrollWhenExpanded?: boolean;
  mono?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const compact = normalizeText(value);
  if (!compact) return <>-</>;

  const needsExpand = compact.length > previewLength;
  const collapsedText = buildPreview(compact, previewLength, preview);
  const valueClass = [
    'detail-expandable__value',
    mono ? 'is-mono' : '',
    !expanded && needsExpand ? 'is-clamped' : '',
    expanded && scrollWhenExpanded ? 'is-expanded-scroll' : '',
  ]
    .filter(Boolean)
    .join(' ');

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(compact);
    } catch {
      // Clipboard may be unavailable outside secure contexts.
    }
  }

  return (
    <div className="detail-expandable">
      <span className={valueClass}>{expanded || !needsExpand ? compact : collapsedText}</span>
      {needsExpand ? (
        <div className="detail-expandable__actions">
          <button
            type="button"
            className="detail-expandable__toggle"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
          <button type="button" className="detail-expandable__toggle" onClick={() => void copyValue()}>
            Copy
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DetailRowStacked({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row-stacked">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function renderCodeGraphNodeDetail(
  node: GraphNode<CodeGraphNodeMeta>,
  _context?: { detail: unknown; error: unknown; loading: boolean },
): ReactNode {
  const meta = nodeMeta(node);
  if (!meta) return null;

  return (
    <>
      <div className="detail-heading">
        <FileCode size={18} aria-hidden="true" />
        <div>
          <span>{formatCodeGraphKind(meta.kind)}</span>
          <h2>{meta.qualifiedName || node.label || node.id}</h2>
        </div>
      </div>
      <div className="score-line">
        <strong>{formatCompactNumber(meta.degree)}</strong>
        <span>CONNECTIONS</span>
      </div>
      <dl>
        <DetailRowStacked label="File">
          <DetailExpandableText value={meta.filePath} preview={pathBasename(meta.filePath)} />
        </DetailRowStacked>
        <div>
          <dt>Lines</dt>
          <dd>
            {meta.startLine}–{meta.endLine}
          </dd>
        </div>
        <div>
          <dt>Language</dt>
          <dd>{meta.language}</dd>
        </div>
        <div>
          <dt>Group</dt>
          <dd>{node.group ?? '-'}</dd>
        </div>
        {meta.isExported ? (
          <div>
            <dt>Exported</dt>
            <dd>Yes</dd>
          </div>
        ) : null}
        {meta.clusterId ? (
          <DetailRowStacked label="File cluster">
            <DetailExpandableText value={meta.clusterId} preview={clusterPreview(meta.clusterId)} />
          </DetailRowStacked>
        ) : null}
        {meta.signature ? (
          <DetailRowStacked label="Signature">
            <DetailExpandableText value={meta.signature} previewLength={120} scrollWhenExpanded mono />
          </DetailRowStacked>
        ) : null}
      </dl>
    </>
  );
}

export function renderCodeGraphEdgeDetail(
  edge: GraphEdge<CodeGraphEdgeMeta>,
  endpoints: { source: EdgeEndpoint<CodeGraphNodeMeta>; target: EdgeEndpoint<CodeGraphNodeMeta> },
): ReactNode {
  const { source, target } = endpoints;
  const sourcePath = nodeMeta(source.node)?.filePath;
  const targetPath = nodeMeta(target.node)?.filePath;

  return (
    <>
      <div className="detail-heading">
        <GitBranch size={18} aria-hidden="true" />
        <div>
          <span>{formatCodeGraphKind(edge.kind)} relationship</span>
          <h2>
            {source.label} <small>to</small> {target.label}
          </h2>
        </div>
      </div>
      <div className="score-line">
        <strong>{Math.round((edge.weight ?? 0.5) * 100)}%</strong>
        <span>WEIGHT</span>
      </div>
      <dl>
        <DetailRowStacked label="Relationship id">
          <DetailExpandableText value={getEdgeId(edge)} mono />
        </DetailRowStacked>
        <DetailRowStacked label="Source file">
          <DetailExpandableText
            value={sourcePath ?? '-'}
            preview={sourcePath ? pathBasename(sourcePath) : undefined}
          />
        </DetailRowStacked>
        <DetailRowStacked label="Target file">
          <DetailExpandableText
            value={targetPath ?? '-'}
            preview={targetPath ? pathBasename(targetPath) : undefined}
          />
        </DetailRowStacked>
        <div>
          <dt>Source group</dt>
          <dd>{source.group ?? '-'}</dd>
        </div>
        <div>
          <dt>Target group</dt>
          <dd>{target.group ?? '-'}</dd>
        </div>
      </dl>
    </>
  );
}

export function codegraphLegend(style?: CSSProperties, theme?: ResolvedGalaxyGraphTheme): ReactNode {
  const edgeSwatch = (color: string) => (theme ? edgeSceneColorHex(color, theme) : color);
  const nodeSwatch = (color: string) => (theme ? nodeSceneColorHex(color, theme) : color);
  return (
    <>
      <span>Symbols</span>
      {CODEGRAPH_NODE_LEGEND.map(({ label, color }) => (
        <b key={label} className="rel" style={{ '--rel': nodeSwatch(color), ...style } as CSSProperties}>
          {label}
        </b>
      ))}
      <span className="legend-sep" aria-hidden="true" />
      <span>Links</span>
      {CODEGRAPH_EDGE_LEGEND.map(({ label, color }) => (
        <b key={label} className="rel" style={{ '--rel': edgeSwatch(color), ...style } as CSSProperties}>
          {label}
        </b>
      ))}
    </>
  );
}
