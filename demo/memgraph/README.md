# Memgraph Demo

This demo stores Galaxy Nodes graph data in Memgraph and exposes it through a small JSON API that matches the visualizer's `GraphDataset` shape.

## Run

```bash
cd demo/memgraph
docker compose up --build
```

Services:

- Memgraph Bolt: `bolt://localhost:7687`
- Memgraph Lab: `http://localhost:3000`
- Graph API: `http://localhost:8787`
- Visualizer dataset endpoint: `http://localhost:8787/graph`
- Node detail endpoint: `http://localhost:8787/graph/node/:id/detail`
- Edge detail endpoint: `http://localhost:8787/graph/edge/:id/detail`
- Expansion endpoints: `/graph/expand/node/:id` and `/graph/expand/direction`

The seed service recreates the demo graph on startup with a sampled corporate relationship layer capped at 12k relationships. Change `DEMO_NODE_COUNT` in `docker-compose.yml` if you want a larger or smaller Memgraph dataset.

> **Local demo only.** The API enables CORS for all origins and Memgraph runs without authentication. Do not expose these services on an untrusted network or use this configuration in production.

## Use With The Visualizer

In another terminal, run the Vite app with the API URL available to the frontend:

```powershell
$env:VITE_GRAPH_API_URL = "http://127.0.0.1:8787"
npm run dev
```

Then click the database button in the left toolbar to load nodes and relationships from Memgraph. Once the Memgraph dataset is loaded, large-graph detail loading and explicit expansion controls are enabled in the visualizer.

## Memgraph Model

- `(:Cluster {id, label, category, centerX, centerY, centerZ, radius, nodeCount, score})`
- `(:GraphNode {id, label, category, clusterId, x, y, z, size, score, sentiment, isMajor, annualImpact, stakeholders, confidence, deliveryRate})`
- `(:Cluster)-[:FILAMENT {id, kind, weight}]->(:Cluster)`
- `(:GraphNode)-[:BLOCKS|DEPENDS_ON|IMPACTS|OWNED_BY|SIGNAL|SUPPORTS {id, kind, weight}]->(:GraphNode)`

The API maps those Memgraph nodes and relationships back to the app's `GraphDataset` JSON contract.
