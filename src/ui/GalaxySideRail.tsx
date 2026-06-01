import { type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Focus,
  RotateCcw,
} from 'lucide-react';
import type { CameraCommand } from './GalaxyScene';
import type { GraphEdge, GraphNode, SpaceDirection } from '../domain/types';
import type { GalaxyGraphLabels } from './galaxyGraphVisualizerTypes';

export interface GalaxySideRailProps<NMeta, EMeta> {
  canExpandGraph: boolean;
  chromeLabels: GalaxyGraphLabels;
  expandDirection: (direction: SpaceDirection) => void;
  expanding: boolean;
  focusEdge: (edge: GraphEdge<EMeta> | null) => void;
  focusNode: (node: GraphNode<NMeta> | null) => void;
  inspectedEdge: GraphEdge<EMeta> | null;
  inspectedNode: GraphNode<NMeta> | null;
  issueCameraCommand: (command: Omit<CameraCommand, 'nonce'>) => void;
  moveCamera: (direction: SpaceDirection) => void;
  sceneControlDisabled: boolean;
  showNavigationControls: boolean;
  sideRailActions?: ReactNode;
}

export function GalaxySideRail<NMeta, EMeta>({
  canExpandGraph,
  chromeLabels,
  expandDirection,
  expanding,
  focusEdge,
  focusNode,
  inspectedEdge,
  inspectedNode,
  issueCameraCommand,
  moveCamera,
  sceneControlDisabled,
  showNavigationControls,
  sideRailActions,
}: GalaxySideRailProps<NMeta, EMeta>) {
  return (
    <aside className="side-rail" aria-label={chromeLabels.sceneTools}>
      <button
        type="button"
        title={chromeLabels.resetCamera}
        aria-label={chromeLabels.resetCamera}
        disabled={sceneControlDisabled}
        onClick={() => issueCameraCommand({ type: 'reset' })}
      >
        <RotateCcw size={17} aria-hidden="true" />
      </button>
      <button
        type="button"
        title={chromeLabels.focusSelection}
        aria-label={chromeLabels.focusSelection}
        disabled={sceneControlDisabled || (!inspectedEdge && !inspectedNode)}
        onClick={() => {
          if (inspectedEdge) focusEdge(inspectedEdge);
          else focusNode(inspectedNode);
        }}
      >
        <Focus size={17} aria-hidden="true" />
      </button>
      {sideRailActions}
      {showNavigationControls ? (
        <>
          <div className="nav-pad" aria-label={chromeLabels.spaceNavigation}>
            <button
              type="button"
              title={chromeLabels.moveUp}
              aria-label={chromeLabels.moveUp}
              disabled={sceneControlDisabled}
              onClick={() => moveCamera('up')}
            >
              <ChevronUp size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              title={chromeLabels.moveForward}
              aria-label={chromeLabels.moveForward}
              disabled={sceneControlDisabled}
              onClick={() => moveCamera('forward')}
            >
              <ArrowUp size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              title={chromeLabels.moveLeft}
              aria-label={chromeLabels.moveLeft}
              disabled={sceneControlDisabled}
              onClick={() => moveCamera('left')}
            >
              <ArrowLeft size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              title={chromeLabels.moveRight}
              aria-label={chromeLabels.moveRight}
              disabled={sceneControlDisabled}
              onClick={() => moveCamera('right')}
            >
              <ArrowRight size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              title={chromeLabels.moveBackward}
              aria-label={chromeLabels.moveBackward}
              disabled={sceneControlDisabled}
              onClick={() => moveCamera('back')}
            >
              <ArrowDown size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              title={chromeLabels.moveDown}
              aria-label={chromeLabels.moveDown}
              disabled={sceneControlDisabled}
              onClick={() => moveCamera('down')}
            >
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          </div>
          {canExpandGraph ? (
            <div className="nav-pad" aria-label={chromeLabels.loadMoreGraphData}>
              <button
                type="button"
                title={chromeLabels.loadMoreUp}
                aria-label={chromeLabels.loadMoreUp}
                disabled={sceneControlDisabled || expanding}
                onClick={() => expandDirection('up')}
              >
                <ChevronUp size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                title={chromeLabels.loadMoreForward}
                aria-label={chromeLabels.loadMoreForward}
                disabled={sceneControlDisabled || expanding}
                onClick={() => expandDirection('forward')}
              >
                <ArrowUp size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                title={chromeLabels.loadMoreLeft}
                aria-label={chromeLabels.loadMoreLeft}
                disabled={sceneControlDisabled || expanding}
                onClick={() => expandDirection('left')}
              >
                <ArrowLeft size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                title={chromeLabels.loadMoreRight}
                aria-label={chromeLabels.loadMoreRight}
                disabled={sceneControlDisabled || expanding}
                onClick={() => expandDirection('right')}
              >
                <ArrowRight size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                title={chromeLabels.loadMoreBackward}
                aria-label={chromeLabels.loadMoreBackward}
                disabled={sceneControlDisabled || expanding}
                onClick={() => expandDirection('back')}
              >
                <ArrowDown size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                title={chromeLabels.loadMoreDown}
                aria-label={chromeLabels.loadMoreDown}
                disabled={sceneControlDisabled || expanding}
                onClick={() => expandDirection('down')}
              >
                <ChevronDown size={15} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}
