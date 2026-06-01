import * as THREE from 'three';
import type { GraphEdge, GraphNode, ResolvedAccessors } from './types';
import type { EdgeEndpoints, SceneLabel } from './sceneTypes';
import {
  CLUSTER_LABEL_INDEX_A,
  CLUSTER_LABEL_INDEX_B,
  CLUSTER_LABEL_LIMIT_GROUPED,
  MAJOR_LABEL_INTERVAL,
  MAJOR_LABEL_LIMIT_GROUPED,
  MAJOR_LABEL_LIMIT_TOP,
  tmpProjected,
} from './sceneConstants';

export function makeLabel(text: string, className: string) {
  const label = document.createElement('div');
  label.className = className;
  label.textContent = text;
  return label;
}

export function setLabelPosition(
  label: HTMLDivElement,
  position: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
) {
  tmpProjected.copy(position).project(camera);
  const visible = tmpProjected.z < 1;
  label.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  label.style.transform = `translate3d(${(tmpProjected.x * 0.5 + 0.5) * width}px, ${(-tmpProjected.y * 0.5 + 0.5) * height}px, 0)`;
}

export function makeSceneLabel(root: HTMLDivElement, className: string): SceneLabel {
  const element = makeLabel('', className);
  element.style.display = 'none';
  root.appendChild(element);
  return { active: false, element, position: new THREE.Vector3() };
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function firstStringValue(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function formatRelationshipLabel(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function edgeDisplayLabel<EMeta>(edge: GraphEdge<EMeta>, accessors: ResolvedAccessors<unknown, EMeta>) {
  const accessorLabel = accessors.edgeLabel(edge);
  if (accessorLabel?.trim()) return formatRelationshipLabel(accessorLabel);

  const edgeRecord = edge as GraphEdge<EMeta> & Record<string, unknown>;
  const metaRecord = isPlainRecord(edge.meta) ? edge.meta : null;
  const label =
    firstStringValue(edgeRecord, ['label', 'name', 'type', 'kind']) ??
    firstStringValue(metaRecord, ['label', 'name', 'type', 'kind']) ??
    'relationship';

  return formatRelationshipLabel(label);
}

export function selectedEdgeDisplayLabel<EMeta>(
  edge: GraphEdge<EMeta>,
  endpoints: EdgeEndpoints,
  accessors: ResolvedAccessors<unknown, EMeta>,
) {
  const relationship = edgeDisplayLabel(edge, accessors);
  const source = endpoints.source.label;
  const target = endpoints.target.label;
  if (!source && !target) return relationship;
  if (!target) return `${source} -> ${relationship}`;
  if (!source) return `${relationship} -> ${target}`;
  return `${source} -> ${relationship} -> ${target}`;
}

export function nodeDisplayLabel<NMeta, EMeta>(node: GraphNode<NMeta>, accessors: ResolvedAccessors<NMeta, EMeta>) {
  const accessorLabel = accessors.nodeLabel(node)?.trim();
  const nodeLabel = node.label?.trim() || node.name?.trim() || node.type?.trim();
  return accessorLabel || nodeLabel || node.id;
}

export function setSceneLabel(label: SceneLabel, text: string | null, position: THREE.Vector3 | null) {
  label.active = Boolean(text && position);
  if (!label.active || !text || !position) {
    label.element.style.display = 'none';
    label.element.textContent = '';
    return;
  }

  label.element.textContent = text;
  label.position.copy(position);
}

export function shouldShowMajorLabel(index: number, activeGroup: string | null) {
  if (activeGroup !== null) return index < MAJOR_LABEL_LIMIT_GROUPED;
  return index < MAJOR_LABEL_LIMIT_TOP || index % MAJOR_LABEL_INTERVAL === 0;
}

export function shouldShowClusterLabel(index: number, activeGroup: string | null) {
  if (activeGroup !== null) return index < CLUSTER_LABEL_LIMIT_GROUPED;
  return index === CLUSTER_LABEL_INDEX_A || index === CLUSTER_LABEL_INDEX_B;
}
