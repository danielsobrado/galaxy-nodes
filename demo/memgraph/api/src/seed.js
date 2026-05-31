import { generateDemoGraph } from './graph-demo.js';
import { closeDriver, driver, waitForMemgraph } from './memgraph.js';

const relationshipTypes = {
  filament: 'FILAMENT',
  signal: 'SIGNAL',
  dependency: 'DEPENDENCY',
};

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function run(session, query, params = {}) {
  return session.run(query, params);
}

async function seed() {
  const count = Number(process.env.DEMO_NODE_COUNT ?? 8000);
  const dataset = generateDemoGraph(count);
  await waitForMemgraph();
  const session = driver.session();

  try {
    await run(session, 'MATCH ()-[r]->() DELETE r');
    await run(session, 'MATCH (n) DELETE n');

    await run(session, 'CREATE INDEX ON :GraphNode(id)').catch(() => undefined);
    await run(session, 'CREATE INDEX ON :Cluster(id)').catch(() => undefined);

    await run(
      session,
      `
      UNWIND $clusters AS row
      CREATE (:Cluster {
        id: row.id,
        label: row.label,
        category: row.category,
        centerX: row.center.x,
        centerY: row.center.y,
        centerZ: row.center.z,
        radius: row.radius,
        nodeCount: row.nodeCount,
        score: row.score
      })
      `,
      { clusters: dataset.clusters },
    );

    for (const nodes of chunk(dataset.nodes, 1000)) {
      await run(
        session,
        `
        UNWIND $nodes AS row
        CREATE (:GraphNode {
          id: row.id,
          label: row.label,
          category: row.category,
          clusterId: row.clusterId,
          x: row.position.x,
          y: row.position.y,
          z: row.position.z,
          size: row.size,
          score: row.score,
          sentiment: row.sentiment,
          annualImpact: row.metrics.annualImpact,
          stakeholders: row.metrics.stakeholders,
          confidence: row.metrics.confidence,
          deliveryRate: row.metrics.deliveryRate,
          isMajor: row.isMajor
        })
        `,
        { nodes },
      );
    }

    for (const [kind, type] of Object.entries(relationshipTypes)) {
      const edges = dataset.edges.filter((edge) => edge.kind === kind);
      for (const rows of chunk(edges, 1000)) {
        await run(
          session,
          `
          UNWIND $rows AS row
          MATCH (source {id: row.source})
          MATCH (target {id: row.target})
          CREATE (source)-[:${type} {
            id: row.id,
            kind: row.kind,
            weight: row.weight
          }]->(target)
          `,
          { rows },
        );
      }
    }

    console.log(
      `Seeded ${dataset.nodes.length} nodes, ${dataset.clusters.length} clusters, ${dataset.edges.length} relationships.`,
    );
  } finally {
    await session.close();
    await closeDriver();
  }
}

seed().catch(async (error) => {
  console.error(error);
  await closeDriver();
  process.exit(1);
});
