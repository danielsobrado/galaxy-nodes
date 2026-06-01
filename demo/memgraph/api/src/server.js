import cors from 'cors';
import express from 'express';
import { closeDriver, driver, waitForMemgraph } from './memgraph.js';

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors());

// Emits the generic galaxy-nodes shape: structural fields at the top level and
// the domain payload under `meta`, matching the corporate demo preset's InitiativeNodeMeta.
function toNumber(value) {
  return typeof value?.toNumber === 'function' ? value.toNumber() : Number(value);
}

function asNodeProperties(properties) {
  return {
    id: properties.id,
    label: properties.label,
    position: {
      x: Number(properties.x),
      y: Number(properties.y),
      z: Number(properties.z),
    },
    size: Number(properties.size),
    major: Boolean(properties.isMajor),
    group: properties.category,
    meta: {
      category: properties.category,
      clusterId: properties.clusterId,
      score: Number(properties.score),
      sentiment: properties.sentiment,
      metrics: {
        annualImpact: toNumber(properties.annualImpact),
        stakeholders: toNumber(properties.stakeholders),
        confidence: Number(properties.confidence),
        deliveryRate: Number(properties.deliveryRate),
      },
    },
  };
}

function asNode(record) {
  return asNodeProperties(record.get('n').properties);
}

function asClusterProperties(properties) {
  return {
    id: properties.id,
    label: properties.label,
    center: {
      x: Number(properties.centerX),
      y: Number(properties.centerY),
      z: Number(properties.centerZ),
    },
    radius: Number(properties.radius),
    group: properties.category,
    meta: {
      category: properties.category,
      nodeCount: Number(properties.nodeCount),
      score: Number(properties.score),
    },
  };
}

function asCluster(record) {
  return asClusterProperties(record.get('c').properties);
}

function asEdge(record) {
  const properties = record.get('r');
  return {
    id: properties.id,
    source: record.get('source'),
    target: record.get('target'),
    weight: Number(properties.weight),
    kind: properties.kind,
  };
}

function readInt(value, fallback, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function readNumber(value, fallback) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function graphPatchForNodes(session, nodeRecords, edgeLimit) {
  const nodes = nodeRecords.map(asNode);
  const ids = nodes.map((node) => node.id);
  const categories = [...new Set(nodes.map((node) => node.group).filter(Boolean))];

  const clusterResult = await session.run(
    `
    MATCH (c:Cluster)
    WHERE c.category IN $categories
    RETURN c
    ORDER BY c.id
    `,
    { categories },
  );
  const clusters = clusterResult.records.map(asCluster);
  const knownIds = new Set([...ids, ...clusters.map((cluster) => cluster.id)]);
  const edgeResult = await session.run(
    `
    MATCH (a)-[relationship]->(b)
    WHERE a.id IN $ids AND b.id IN $ids
    RETURN properties(relationship) AS r, a.id AS source, b.id AS target
    ORDER BY r.weight DESC, r.id
    LIMIT $edgeLimit
    `,
    { ids: [...knownIds], edgeLimit },
  );
  const edges = edgeResult.records.map(asEdge).filter((edge) => knownIds.has(edge.source) && knownIds.has(edge.target));

  return {
    nodes,
    clusters,
    edges,
    generatedAt: new Date().toISOString(),
  };
}

app.get('/health', async (_request, response) => {
  const session = driver.session();
  try {
    await session.run('RETURN 1 AS ok');
    response.json({ ok: true });
  } catch (error) {
    response.status(503).json({ ok: false, error: error.message });
  } finally {
    await session.close();
  }
});

app.get('/graph', async (request, response) => {
  const limit = readInt(request.query.limit, 100000, 100000);
  const category = typeof request.query.category === 'string' ? request.query.category : 'All';
  const session = driver.session();

  try {
    const nodeResult = await session.run(
      `
      MATCH (n:GraphNode)
      WHERE $category = 'All' OR n.category = $category
      RETURN n
      ORDER BY n.id
      LIMIT $limit
      `,
      { category, limit },
    );
    const clusterResult = await session.run(
      `
      MATCH (c:Cluster)
      WHERE $category = 'All' OR c.category = $category
      RETURN c
      ORDER BY c.id
      `,
      { category },
    );
    const edgeResult = await session.run(
      `
      MATCH (a)-[relationship]->(b)
      WHERE $category = 'All' OR a.category = $category OR b.category = $category
      RETURN properties(relationship) AS r, a.id AS source, b.id AS target
      ORDER BY r.id
      LIMIT 20000
      `,
      { category },
    );

    const nodes = nodeResult.records.map(asNode);
    const clusters = clusterResult.records.map(asCluster);
    // Nodes are capped by `limit` but edges are not, so an edge can reference a
    // node beyond the cap. Drop those so the client never sees dangling edges.
    const knownIds = new Set([...nodes.map((node) => node.id), ...clusters.map((cluster) => cluster.id)]);
    const edges = edgeResult.records
      .map(asEdge)
      .filter((edge) => knownIds.has(edge.source) && knownIds.has(edge.target));

    response.json({
      nodes,
      clusters,
      edges,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    response.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

app.get('/graph/node/:id/detail', async (request, response) => {
  const session = driver.session();

  try {
    const result = await session.run(
      `
      MATCH (n:GraphNode {id: $id})
      OPTIONAL MATCH (c:Cluster {id: n.clusterId})
      OPTIONAL MATCH (n)-[outgoing]->()
      WITH n, c, count(outgoing) AS outgoingCount
      OPTIONAL MATCH ()-[incoming]->(n)
      RETURN n, c, outgoingCount, count(incoming) AS incomingCount
      `,
      { id: request.params.id },
    );
    const record = result.records[0];
    if (!record) {
      response.status(404).json({ error: 'Node not found' });
      return;
    }

    const cluster = record.get('c');
    response.json({
      node: asNode(record),
      cluster: cluster ? asClusterProperties(cluster.properties) : null,
      degree: {
        incoming: toNumber(record.get('incomingCount')),
        outgoing: toNumber(record.get('outgoingCount')),
      },
    });
  } catch (error) {
    response.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

app.get('/graph/edge/:id/detail', async (request, response) => {
  const session = driver.session();

  try {
    const result = await session.run(
      `
      MATCH (a)-[relationship]->(b)
      WHERE relationship.id = $id
      RETURN properties(relationship) AS r, a.id AS source, b.id AS target, a, b
      `,
      { id: request.params.id },
    );
    const record = result.records[0];
    if (!record) {
      response.status(404).json({ error: 'Edge not found' });
      return;
    }

    response.json({
      edge: asEdge(record),
      source: asNodeProperties(record.get('a').properties),
      target: asNodeProperties(record.get('b').properties),
    });
  } catch (error) {
    response.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

app.get('/graph/expand/node/:id', async (request, response) => {
  const limit = readInt(request.query.limit, 1500, 10000);
  const edgeLimit = readInt(request.query.edgeLimit, 3000, 20000);
  const session = driver.session();

  try {
    const nodeResult = await session.run(
      `
      MATCH (center:GraphNode {id: $id})
      MATCH (center)-[]-(n:GraphNode)
      RETURN DISTINCT n
      ORDER BY n.score DESC, n.id
      LIMIT $limit
      `,
      { id: request.params.id, limit },
    );

    response.json(await graphPatchForNodes(session, nodeResult.records, edgeLimit));
  } catch (error) {
    response.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

app.get('/graph/expand/direction', async (request, response) => {
  const limit = readInt(request.query.limit, 1500, 10000);
  const edgeLimit = readInt(request.query.edgeLimit, 3000, 20000);
  const category = typeof request.query.category === 'string' ? request.query.category : 'All';
  const x = readNumber(request.query.x, 0);
  const y = readNumber(request.query.y, 0);
  const z = readNumber(request.query.z, 0);
  const dx = readNumber(request.query.dx, 0);
  const dy = readNumber(request.query.dy, 0);
  const dz = readNumber(request.query.dz, -1);
  const session = driver.session();

  try {
    // Demo implementation: this scans GraphNode coordinates in Memgraph. A
    // production-sized graph should back directional expansion with a spatial
    // index or precomputed neighborhood service.
    const nodeResult = await session.run(
      `
      MATCH (n:GraphNode)
      WITH n, ((n.x - $x) * $dx + (n.y - $y) * $dy + (n.z - $z) * $dz) AS projection
      WHERE projection > 0 AND ($category = 'All' OR n.category = $category)
      RETURN n
      ORDER BY projection ASC, n.score DESC
      LIMIT $limit
      `,
      { category, dx, dy, dz, limit, x, y, z },
    );

    response.json(await graphPatchForNodes(session, nodeResult.records, edgeLimit));
  } catch (error) {
    response.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

await waitForMemgraph();

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Galaxy Nodes Memgraph API listening on ${port}`);
});

process.on('SIGTERM', async () => {
  server.close();
  await closeDriver();
});
