#!/usr/bin/env node
/**
 * Export CodeGraph SQLite index to Galaxy Nodes GraphDataset JSON.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DB = path.join(repoRoot, '.codegraph', 'codegraph.db');
const DEFAULT_OUT = path.join(repoRoot, 'examples/basic/public/codegraph-dataset.json');

const EDGE_WEIGHT_BY_KIND = {
  calls: 1,
  references: 0.85,
  imports: 0.5,
  instantiates: 0.7,
  contains: 0.35,
};

const MAJOR_NODE_KINDS = new Set(['file', 'class', 'interface']);
const DEFAULT_NODE_SIZE = 1;
const MIN_NODE_SIZE = 0.65;
const MAX_NODE_SIZE = 2.4;

function parseArgs(argv) {
  const options = {
    db: DEFAULT_DB,
    out: DEFAULT_OUT,
    edgeKinds: null,
    nodeKinds: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--db') {
      options.db = path.resolve(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (arg === '--out') {
      options.out = path.resolve(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (arg === '--edge-kinds') {
      options.edgeKinds = splitKinds(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--node-kinds') {
      options.nodeKinds = splitKinds(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function splitKinds(value) {
  if (!value) return null;
  return new Set(
    value
      .split(',')
      .map((kind) => kind.trim())
      .filter(Boolean),
  );
}

function printHelp() {
  console.log(`Usage: node scripts/export-codegraph-dataset.mjs [options]

Options:
  --db <path>           CodeGraph database (default: .codegraph/codegraph.db)
  --out <path>          Output JSON path (default: examples/basic/public/codegraph-dataset.json)
  --edge-kinds <list>   Comma-separated edge kinds filter (calls,contains,...)
  --node-kinds <list>   Comma-separated node kinds filter (function,class,...)
`);
}

function topLevelGroup(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const segment = normalized.split('/').find(Boolean);
  return segment ?? 'root';
}

function basename(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || filePath;
}

function edgeWeight(kind) {
  return EDGE_WEIGHT_BY_KIND[kind] ?? 0.5;
}

function scaleNodeSize(degree, maxDegree) {
  if (maxDegree <= 0) return DEFAULT_NODE_SIZE;
  const ratio = degree / maxDegree;
  return MIN_NODE_SIZE + ratio * (MAX_NODE_SIZE - MIN_NODE_SIZE);
}

function isMajorNode(row) {
  return Boolean(row.is_exported) || MAJOR_NODE_KINDS.has(row.kind);
}

export function buildCodeGraphDataset(db, filters = {}) {
  const edgeKinds = filters.edgeKinds ?? null;
  const nodeKinds = filters.nodeKinds ?? null;

  const nodeRows = db
    .prepare(
      `SELECT
        n.id,
        n.kind,
        n.name,
        n.qualified_name,
        n.file_path,
        n.language,
        n.start_line,
        n.end_line,
        n.signature,
        n.is_exported,
        COALESCE(inc.incoming, 0) + COALESCE(outg.outgoing, 0) AS degree
      FROM nodes n
      LEFT JOIN (
        SELECT target AS id, COUNT(*) AS incoming
        FROM edges
        GROUP BY target
      ) inc ON inc.id = n.id
      LEFT JOIN (
        SELECT source AS id, COUNT(*) AS outgoing
        FROM edges
        GROUP BY source
      ) outg ON outg.id = n.id
      ORDER BY n.file_path, n.start_line, n.name`,
    )
    .all();

  const maxDegree = nodeRows.reduce((max, row) => Math.max(max, row.degree ?? 0), 0);

  const filteredNodeRows = nodeRows.filter((row) => !nodeKinds || nodeKinds.has(row.kind));
  const nodeIdSet = new Set(filteredNodeRows.map((row) => row.id));

  const edgeRows = db
    .prepare(
      `SELECT rowid, source, target, kind
       FROM edges
       ORDER BY rowid`,
    )
    .all()
    .filter((row) => {
      if (edgeKinds && !edgeKinds.has(row.kind)) return false;
      return nodeIdSet.has(row.source) && nodeIdSet.has(row.target);
    });

  const containsParents = new Map();
  for (const row of db.prepare(`SELECT source, target FROM edges WHERE kind = 'contains'`).all()) {
    if (nodeIdSet.has(row.target)) containsParents.set(row.target, row.source);
  }

  const nodes = filteredNodeRows.map((row) => ({
    id: row.id,
    label: row.name,
    type: row.kind,
    group: topLevelGroup(row.file_path),
    major: isMajorNode(row),
    size: scaleNodeSize(row.degree ?? 0, maxDegree),
    meta: {
      kind: row.kind,
      qualifiedName: row.qualified_name,
      filePath: row.file_path,
      language: row.language,
      startLine: row.start_line,
      endLine: row.end_line,
      signature: row.signature ?? null,
      isExported: Boolean(row.is_exported),
      clusterId: containsParents.get(row.id) ?? null,
      degree: row.degree ?? 0,
    },
  }));

  const edges = edgeRows.map((row) => ({
    id: `edge:${row.rowid}`,
    source: row.source,
    target: row.target,
    kind: row.kind,
    weight: edgeWeight(row.kind),
    meta: { kind: row.kind },
  }));

  const clusters = filteredNodeRows
    .filter((row) => row.kind === 'file')
    .map((row) => ({
      id: row.id,
      label: basename(row.file_path),
      group: topLevelGroup(row.file_path),
      meta: {
        filePath: row.file_path,
        language: row.language,
      },
    }));

  return {
    nodes,
    edges,
    clusters,
    generatedAt: new Date().toISOString(),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  let db;
  try {
    db = new DatabaseSync(options.db, { readOnly: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to open CodeGraph database at ${options.db}: ${message}`);
    console.error('Run: codegraph init -i');
    process.exit(1);
  }

  const dataset = buildCodeGraphDataset(db, {
    edgeKinds: options.edgeKinds,
    nodeKinds: options.nodeKinds,
  });
  db.close();

  await mkdir(path.dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(dataset)}\n`, 'utf8');

  console.log(
    `Exported ${dataset.nodes.length} nodes, ${dataset.edges.length} edges, ${dataset.clusters.length} clusters -> ${options.out}`,
  );
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
