import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { parseGraphDataset } from '../../../src/domain/data';
import type { GraphDataset } from '../../../src/domain/types';
import { buildCodeGraphDataset } from '../../../scripts/export-codegraph-dataset.mjs';
import { createCodeGraphAccessors } from './codegraph/core';

function seedDatabase(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      qualified_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      language TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      signature TEXT,
      is_exported INTEGER DEFAULT 0
    );
    CREATE TABLE edges (
      rowid INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      kind TEXT NOT NULL
    );
  `);

  const insertNode = db.prepare(`
    INSERT INTO nodes (id, kind, name, qualified_name, file_path, language, start_line, end_line, signature, is_exported)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertNode.run('file:src/a.ts', 'file', 'a.ts', 'a.ts', 'src/a.ts', 'typescript', 1, 40, null, 0);
  insertNode.run('function:foo', 'function', 'foo', 'foo', 'src/a.ts', 'typescript', 5, 12, 'function foo()', 1);
  insertNode.run('function:bar', 'function', 'bar', 'bar', 'src/b.ts', 'typescript', 2, 8, null, 0);

  const insertEdge = db.prepare('INSERT INTO edges (source, target, kind) VALUES (?, ?, ?)');
  insertEdge.run('file:src/a.ts', 'function:foo', 'contains');
  insertEdge.run('function:foo', 'function:bar', 'calls');
}

describe('buildCodeGraphDataset', () => {
  it('maps CodeGraph rows into a parseable GraphDataset', () => {
    const db = new DatabaseSync(':memory:');
    seedDatabase(db);

    const dataset: GraphDataset = buildCodeGraphDataset(db, { edgeKinds: new Set(['calls', 'contains']) });
    db.close();

    expect(dataset.nodes).toHaveLength(3);
    expect(dataset.edges).toHaveLength(2);
    expect(dataset.clusters).toHaveLength(1);

    const foo = dataset.nodes.find((node) => node.id === 'function:foo');
    expect(foo?.group).toBe('src');
    expect(foo?.major).toBe(true);
    expect(foo?.meta).toMatchObject({
      kind: 'function',
      qualifiedName: 'foo',
      filePath: 'src/a.ts',
      clusterId: 'file:src/a.ts',
    });

    const parsed = parseGraphDataset(dataset);
    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.edges).toHaveLength(2);
    expect(parsed.clusters).toHaveLength(1);
  });

  it('filters node and edge kinds when requested', () => {
    const db = new DatabaseSync(':memory:');
    seedDatabase(db);

    const dataset: GraphDataset = buildCodeGraphDataset(db, {
      edgeKinds: new Set(['calls']),
      nodeKinds: new Set(['function']),
    });
    db.close();

    expect(dataset.nodes.every((node) => node.type === 'function')).toBe(true);
    expect(dataset.edges.every((edge) => edge.kind === 'calls')).toBe(true);
    expect(dataset.clusters).toHaveLength(0);
  });

  it('reads a file-backed CodeGraph database when present', () => {
    const sourceDb = path.join(process.cwd(), '.codegraph', 'codegraph.db');
    if (!existsSync(sourceDb)) return;

    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'codegraph-export-'));
    const tempDbPath = path.join(tempDir, 'codegraph.db');
    try {
      copyFileSync(sourceDb, tempDbPath);
      const db = new DatabaseSync(tempDbPath, { readOnly: true });
      const dataset = buildCodeGraphDataset(db);
      db.close();
      expect(dataset.nodes.length).toBeGreaterThan(100);
      expect(dataset.edges.length).toBeGreaterThan(100);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('createCodeGraphAccessors', () => {
  it('colors nodes and edges by kind', () => {
    const accessors = createCodeGraphAccessors();
    const nodeColor = accessors.nodeColor?.({
      id: 'function:foo',
      label: 'foo',
      meta: {
        kind: 'function',
        qualifiedName: 'foo',
        filePath: 'src/a.ts',
        language: 'typescript',
        startLine: 1,
        endLine: 2,
        signature: null,
        isExported: true,
        clusterId: null,
        degree: 3,
      },
    });
    const edgeColor = accessors.edgeColor?.({
      source: 'function:foo',
      target: 'function:bar',
      kind: 'calls',
    });

    expect(nodeColor).toBe('#6bd7ff');
    expect(edgeColor).toBe('#6bd7ff');
  });
});
