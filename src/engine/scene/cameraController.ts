import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GalaxyCameraView, GraphNode, ResolvedAccessors, SpaceDirection, Vec3 } from '../../domain/types';
import {
  CAMERA_MOVE_DISTANCE,
  EDGE_MIDPOINT_LERP,
  FOCUS_EDGE_MIN_DISTANCE,
  FOCUS_EDGE_OFFSET_X_BASE,
  FOCUS_EDGE_OFFSET_XY_SCALE,
  FOCUS_EDGE_OFFSET_Y_BASE,
  FOCUS_EDGE_OFFSET_Z_BASE,
  FOCUS_EDGE_OFFSET_Z_SCALE,
  FOCUS_NODE_OFFSET_X_BASE,
  FOCUS_NODE_OFFSET_X_SCALE,
  FOCUS_NODE_OFFSET_Y_BASE,
  FOCUS_NODE_OFFSET_Y_SCALE,
  FOCUS_NODE_OFFSET_Z_BASE,
  FOCUS_NODE_OFFSET_Z_SCALE,
  KEY_MOVE_SPEED,
  KEY_MOVE_SPEED_VERTICAL,
  KEY_SHIFT_BOOST,
} from '../sceneConstants';
import type { EdgeEndpoints } from '../sceneTypes';
import { isTypingTarget, vectorToVec3 } from './endpoints';

export interface CameraControllerDeps<NMeta = unknown, EMeta = unknown> {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  world: THREE.Object3D;
  nodeLookup: Map<string, GraphNode<NMeta>>;
  nodePositions: Map<string, Vec3>;
  edgeEndpoints: Map<string, EdgeEndpoints>;
  accessors: () => ResolvedAccessors<NMeta, EMeta>;
  planetRadius: (node: GraphNode<NMeta>) => number;
  homePosition: THREE.Vector3;
  homeTarget: THREE.Vector3;
  onCameraViewChange: (view: GalaxyCameraView) => void;
}

export interface CameraController {
  currentView(): GalaxyCameraView;
  emitView(): void;
  focusEdge(edgeId: string): void;
  focusNode(nodeId: string): void;
  move(direction: SpaceDirection, multiplier?: number, skipUpdate?: boolean): void;
  reset(): void;
  handleKeyDown(event: KeyboardEvent): void;
  handleKeyUp(event: KeyboardEvent): void;
  tickKeyboardMovement(): boolean;
}

export function createCameraController<NMeta = unknown, EMeta = unknown>(
  deps: CameraControllerDeps<NMeta, EMeta>,
): CameraController {
  const {
    camera,
    controls,
    world,
    nodeLookup,
    nodePositions,
    edgeEndpoints,
    accessors,
    planetRadius,
    homePosition,
    homeTarget,
    onCameraViewChange,
  } = deps;
  const cameraViewDirection = new THREE.Vector3();
  const cameraViewRight = new THREE.Vector3();
  const cameraViewUp = new THREE.Vector3();
  const tmpDirection = new THREE.Vector3();
  const tmpRight = new THREE.Vector3();
  const tmpMove = new THREE.Vector3();
  const pressedKeys = new Set<string>();

  function currentView(): GalaxyCameraView {
    const direction = camera.getWorldDirection(cameraViewDirection).normalize();
    const right = cameraViewRight.crossVectors(direction, camera.up).normalize();
    const up = cameraViewUp.copy(camera.up).normalize();
    return {
      direction: vectorToVec3(direction),
      position: vectorToVec3(camera.position),
      right: vectorToVec3(right),
      target: vectorToVec3(controls.target),
      up: vectorToVec3(up),
    };
  }

  function emitView() {
    onCameraViewChange(currentView());
  }

  function focusNode(nodeId: string) {
    const node = nodeLookup.get(nodeId);
    const position = node ? nodePositions.get(node.id) : undefined;
    if (!node || !position) return;
    const target = new THREE.Vector3(position.x, position.y, position.z).applyQuaternion(world.quaternion);
    const nodeSize = Math.max(accessors().nodeSize(node), planetRadius(node));
    controls.target.copy(target);
    camera.position
      .copy(target)
      .add(
        new THREE.Vector3(
          nodeSize * FOCUS_NODE_OFFSET_X_SCALE + FOCUS_NODE_OFFSET_X_BASE,
          nodeSize * FOCUS_NODE_OFFSET_Y_SCALE + FOCUS_NODE_OFFSET_Y_BASE,
          nodeSize * FOCUS_NODE_OFFSET_Z_SCALE + FOCUS_NODE_OFFSET_Z_BASE,
        ),
      );
    controls.update();
    emitView();
  }

  function focusEdge(edgeId: string) {
    const endpoints = edgeEndpoints.get(edgeId);
    if (!endpoints) return;

    const sourcePosition = endpoints.source.position.clone().applyQuaternion(world.quaternion);
    const targetPosition = endpoints.target.position.clone().applyQuaternion(world.quaternion);
    const midpoint = sourcePosition.clone().lerp(targetPosition, EDGE_MIDPOINT_LERP);
    const distance = Math.max(FOCUS_EDGE_MIN_DISTANCE, sourcePosition.distanceTo(targetPosition));
    controls.target.copy(midpoint);
    camera.position
      .copy(midpoint)
      .add(
        new THREE.Vector3(
          distance * FOCUS_EDGE_OFFSET_XY_SCALE + FOCUS_EDGE_OFFSET_X_BASE,
          distance * FOCUS_EDGE_OFFSET_XY_SCALE + FOCUS_EDGE_OFFSET_Y_BASE,
          distance * FOCUS_EDGE_OFFSET_Z_SCALE + FOCUS_EDGE_OFFSET_Z_BASE,
        ),
      );
    controls.update();
    emitView();
  }

  function move(direction: SpaceDirection, multiplier = 1, skipUpdate = false) {
    camera.getWorldDirection(tmpDirection).normalize();
    tmpRight.crossVectors(tmpDirection, camera.up).normalize();
    tmpMove.set(0, 0, 0);

    if (direction === 'forward') tmpMove.copy(tmpDirection);
    if (direction === 'back') tmpMove.copy(tmpDirection).multiplyScalar(-1);
    if (direction === 'right') tmpMove.copy(tmpRight);
    if (direction === 'left') tmpMove.copy(tmpRight).multiplyScalar(-1);
    if (direction === 'up') tmpMove.copy(camera.up).normalize();
    if (direction === 'down') tmpMove.copy(camera.up).normalize().multiplyScalar(-1);

    const distance = CAMERA_MOVE_DISTANCE * multiplier;
    camera.position.addScaledVector(tmpMove, distance);
    controls.target.addScaledVector(tmpMove, distance);
    if (!skipUpdate) controls.update();
    emitView();
  }

  function reset() {
    camera.position.copy(homePosition);
    controls.target.copy(homeTarget);
    controls.update();
    emitView();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      event.preventDefault();
      pressedKeys.add(key);
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    pressedKeys.delete(event.key.toLowerCase());
  }

  function tickKeyboardMovement() {
    const keySpeed = pressedKeys.has('shift') ? KEY_SHIFT_BOOST : 1;
    let moved = false;
    if (pressedKeys.has('w') || pressedKeys.has('arrowup')) {
      move('forward', keySpeed * KEY_MOVE_SPEED, true);
      moved = true;
    }
    if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) {
      move('back', keySpeed * KEY_MOVE_SPEED, true);
      moved = true;
    }
    if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) {
      move('left', keySpeed * KEY_MOVE_SPEED, true);
      moved = true;
    }
    if (pressedKeys.has('d') || pressedKeys.has('arrowright')) {
      move('right', keySpeed * KEY_MOVE_SPEED, true);
      moved = true;
    }
    if (pressedKeys.has('e')) {
      move('up', keySpeed * KEY_MOVE_SPEED_VERTICAL, true);
      moved = true;
    }
    if (pressedKeys.has('q')) {
      move('down', keySpeed * KEY_MOVE_SPEED_VERTICAL, true);
      moved = true;
    }
    return moved;
  }

  return {
    currentView,
    emitView,
    focusEdge,
    focusNode,
    move,
    reset,
    handleKeyDown,
    handleKeyUp,
    tickKeyboardMovement,
  };
}
