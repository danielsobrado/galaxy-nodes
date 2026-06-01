import { type ReactNode } from 'react';
import { GitBranch, Navigation, Radar, Upload } from 'lucide-react';
import type { EdgeEndpoint, GraphEdge, GraphNode, ResolvedAccessors } from './types';
import type { GalaxyGraphLabels, LargeGraphDetailContext } from './galaxyGraphVisualizerTypes';
import { edgeDisplayText, nodeDisplayText } from './galaxyGraphVisualizerUtils';

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
  return (
    <>
      {showDetailPanel && inspectedNode ? (
        <aside className="detail-panel">
          {renderNodeDetail ? (
            renderNodeDetail(inspectedNode, nodeDetailContext)
          ) : (
            <>
              <div className="detail-heading">
                <Radar size={18} aria-hidden="true" />
                <div>
                  {inspectedNode.group ? <span>{inspectedNode.group}</span> : null}
                  <h2>{nodeDisplayText(inspectedNode, resolvedAccessors)}</h2>
                </div>
              </div>
              <dl>
                <div>
                  <dt>{chromeLabels.nodeId}</dt>
                  <dd>{inspectedNode.id}</dd>
                </div>
                {inspectedNode.group ? (
                  <div>
                    <dt>{chromeLabels.group}</dt>
                    <dd>{inspectedNode.group}</dd>
                  </div>
                ) : null}
                {inspectedNode.size !== undefined ? (
                  <div>
                    <dt>{chromeLabels.size}</dt>
                    <dd>{inspectedNode.size.toFixed(1)}</dd>
                  </div>
                ) : null}
              </dl>
            </>
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
