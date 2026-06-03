import { type ReactNode } from 'react';
import { GitBranch, Navigation, Radar, Upload } from 'lucide-react';
import type { EdgeEndpoint, GraphEdge, GraphNode, ResolvedAccessors } from '../domain/types';
import type { GalaxyGraphLabels, LargeGraphDetailContext } from './galaxyGraphVisualizerTypes';
import { edgeDisplayText, nodeDisplayText } from './galaxyGraphVisualizerUtils';
import type { GalaxyNodeHoverAnchor } from './GalaxyScene';

export interface GalaxyDetailPanelsProps<NMeta, EMeta> {
  canExpandGraph: boolean;
  chromeLabels: GalaxyGraphLabels;
  displayEdgeId: (edge: GraphEdge<EMeta>) => string;
  edgeDetailContext: LargeGraphDetailContext | undefined;
  expandError: unknown;
  expandNode: (node: GraphNode<NMeta> | null) => void;
  expanding: boolean;
  focusEdge: (edge: GraphEdge<EMeta> | null) => void;
  focusNode: (node: GraphNode<NMeta> | null) => void;
  inspectedEdge: GraphEdge<EMeta> | null;
  inspectedNode: GraphNode<NMeta> | null;
  hoverDetailAnchor: GalaxyNodeHoverAnchor | null;
  hoverDetailNode: GraphNode<NMeta> | null;
  largeGraphEnabled: boolean;
  nodeDetailContext: LargeGraphDetailContext | undefined;
  renderEdgeDetail?: (
    edge: GraphEdge<EMeta>,
    endpoints: { source: EdgeEndpoint<NMeta>; target: EdgeEndpoint<NMeta> },
    context?: LargeGraphDetailContext,
  ) => ReactNode;
  renderNodeDetail?: (node: GraphNode<NMeta>, context?: LargeGraphDetailContext) => ReactNode;
  resolvedAccessors: ResolvedAccessors<NMeta, EMeta>;
  sceneControlDisabled: boolean;
  showDetailPanel: boolean;
  sourceEndpoint: EdgeEndpoint<NMeta> | null;
  targetEndpoint: EdgeEndpoint<NMeta> | null;
}

export function GalaxyDetailPanels<NMeta, EMeta>({
  canExpandGraph,
  chromeLabels,
  displayEdgeId,
  edgeDetailContext,
  expandError,
  expandNode,
  expanding,
  focusEdge,
  focusNode,
  inspectedEdge,
  inspectedNode,
  hoverDetailAnchor,
  hoverDetailNode,
  largeGraphEnabled,
  nodeDetailContext,
  renderEdgeDetail,
  renderNodeDetail,
  resolvedAccessors,
  sceneControlDisabled,
  showDetailPanel,
  sourceEndpoint,
  targetEndpoint,
}: GalaxyDetailPanelsProps<NMeta, EMeta>) {
  const hoverPanelStyle =
    hoverDetailAnchor && hoverDetailAnchor.visible
      ? ({
          left: `${hoverDetailAnchor.x}px`,
          top: `${hoverDetailAnchor.y}px`,
          transform:
            hoverDetailAnchor.x > hoverDetailAnchor.viewportWidth - 380
              ? 'translate(calc(-100% - 18px), -50%)'
              : 'translate(18px, -50%)',
        } as const)
      : undefined;

  return (
    <>
      {showDetailPanel && inspectedNode ? (
        <aside className="detail-panel">
          {renderNodeDetail ? (
            renderNodeDetail(inspectedNode, nodeDetailContext)
          ) : (
            <NodeDetailBody chromeLabels={chromeLabels} node={inspectedNode} resolvedAccessors={resolvedAccessors} />
          )}
          <button type="button" disabled={sceneControlDisabled} onClick={() => focusNode(inspectedNode)}>
            <Upload size={15} aria-hidden="true" />
            {chromeLabels.navigate}
          </button>
          {canExpandGraph ? (
            <button
              type="button"
              disabled={sceneControlDisabled || expanding}
              onClick={() => expandNode(inspectedNode)}
            >
              <GitBranch size={15} aria-hidden="true" />
              {expanding ? chromeLabels.loading : chromeLabels.expandNeighbors}
            </button>
          ) : null}
          {largeGraphEnabled && expandError ? <span role="status">{chromeLabels.expansionFailed}</span> : null}
        </aside>
      ) : null}

      {showDetailPanel && hoverDetailNode && hoverPanelStyle ? (
        <aside className="detail-panel hover-detail-panel" style={hoverPanelStyle} aria-hidden="true" inert>
          {renderNodeDetail ? (
            renderNodeDetail(hoverDetailNode)
          ) : (
            <NodeDetailBody chromeLabels={chromeLabels} node={hoverDetailNode} resolvedAccessors={resolvedAccessors} />
          )}
        </aside>
      ) : null}

      {showDetailPanel && inspectedEdge && sourceEndpoint && targetEndpoint ? (
        <aside className="detail-panel connection-panel">
          {renderEdgeDetail ? (
            renderEdgeDetail(inspectedEdge, { source: sourceEndpoint, target: targetEndpoint }, edgeDetailContext)
          ) : (
            <>
              <div className="detail-heading">
                <GitBranch size={18} aria-hidden="true" />
                <div>
                  <span>{edgeDisplayText(inspectedEdge, resolvedAccessors)}</span>
                  <h2>
                    {sourceEndpoint.label} <small>{chromeLabels.to}</small> {targetEndpoint.label}
                  </h2>
                </div>
              </div>
              <div className="score-line">
                <strong>{Math.round((inspectedEdge.weight ?? 0.5) * 100)}%</strong>
                <span>{chromeLabels.strength}</span>
              </div>
              <dl>
                <div>
                  <dt>{chromeLabels.relationshipId}</dt>
                  <dd>{displayEdgeId(inspectedEdge)}</dd>
                </div>
                {sourceEndpoint.group ? (
                  <div>
                    <dt>{chromeLabels.source}</dt>
                    <dd>{sourceEndpoint.group}</dd>
                  </div>
                ) : null}
                {targetEndpoint.group ? (
                  <div>
                    <dt>{chromeLabels.target}</dt>
                    <dd>{targetEndpoint.group}</dd>
                  </div>
                ) : null}
              </dl>
            </>
          )}
          <div className="detail-actions">
            <button type="button" disabled={sceneControlDisabled} onClick={() => focusEdge(inspectedEdge)}>
              <Navigation size={15} aria-hidden="true" />
              {chromeLabels.traceLink}
            </button>
            {sourceEndpoint.node ? (
              <button type="button" disabled={sceneControlDisabled} onClick={() => focusNode(sourceEndpoint.node)}>
                {chromeLabels.source}
              </button>
            ) : null}
            {targetEndpoint.node ? (
              <button type="button" disabled={sceneControlDisabled} onClick={() => focusNode(targetEndpoint.node)}>
                {chromeLabels.target}
              </button>
            ) : null}
          </div>
        </aside>
      ) : null}
    </>
  );
}

interface NodeDetailBodyProps<NMeta, EMeta> {
  chromeLabels: GalaxyGraphLabels;
  node: GraphNode<NMeta>;
  resolvedAccessors: ResolvedAccessors<NMeta, EMeta>;
}

function NodeDetailBody<NMeta, EMeta>({ chromeLabels, node, resolvedAccessors }: NodeDetailBodyProps<NMeta, EMeta>) {
  return (
    <>
      <div className="detail-heading">
        <Radar size={18} aria-hidden="true" />
        <div>
          {node.group ? <span>{node.group}</span> : null}
          <h2>{nodeDisplayText(node, resolvedAccessors)}</h2>
        </div>
      </div>
      <dl>
        <div>
          <dt>{chromeLabels.nodeId}</dt>
          <dd>{node.id}</dd>
        </div>
        {node.group ? (
          <div>
            <dt>{chromeLabels.group}</dt>
            <dd>{node.group}</dd>
          </div>
        ) : null}
        {node.size !== undefined ? (
          <div>
            <dt>{chromeLabels.size}</dt>
            <dd>{node.size.toFixed(1)}</dd>
          </div>
        ) : null}
      </dl>
    </>
  );
}
