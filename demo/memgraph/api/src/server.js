import cors from 'cors';
import express from 'express';
import { closeDriver, driver, waitForMemgraph } from './memgraph.js';

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors());

function asNode(record) {
  const properties = record.get('n').properties;
  return {
    id: properties.id,
    label: properties.label,
    category: properties.category,
    clusterId: properties.clusterId,
    position: {
      x: Number(properties.x),
      y: Number(properties.y),
      z: Number(properties.z),
    },
    size: Number(properties.size),
    score: Number(properties.score),
    sentiment: properties.sentiment,
    metrics: {
      volume: Number(properties.volume),
      activeTraders: Number(properties.activeTraders),
      marketPrice: Number(properties.marketPrice),
      winRate: Number(properties.winRate),
    },
    isMajor: Boolean(properties.isMajor),
  };
}

function asCluster(record) {
  const properties = record.get('c').properties;
  return {
    id: properties.id,
    label: properties.label,
    category: properties.category,
    center: {
      x: Number(properties.centerX),
      y: Number(properties.centerY),
      z: Number(properties.centerZ),
    },
    radius: Number(properties.radius),
    nodeCount: Number(properties.nodeCount),
    score: Number(properties.score),
  };
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
  const limit = Math.max(1, Math.min(Number(request.query.limit ?? 100000), 100000));
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

    response.json({
      nodes: nodeResult.records.map(asNode),
      clusters: clusterResult.records.map(asCluster),
      edges: edgeResult.records.map(asEdge),
      generatedAt: new Date().toISOString(),
    });
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
