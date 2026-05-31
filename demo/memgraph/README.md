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

The seed service recreates the demo graph on startup. Change `DEMO_NODE_COUNT` in `docker-compose.yml` if you want a larger or smaller Memgraph dataset.

## Use With The Visualizer

In another terminal, run the Vite app with the API URL available to the frontend:

```powershell
$env:VITE_GRAPH_API_URL = "http://127.0.0.1:8787"
npm run dev
```

Then click the database button in the left toolbar to load nodes and relationships from Memgraph.

## Memgraph Model

- `(:Cluster {id, label, category, centerX, centerY, centerZ, radius, nodeCount, score})`
- `(:GraphNode {id, label, category, clusterId, x, y, z, size, score, sentiment, isMajor, volume, activeTraders, marketPrice, winRate})`
- `(:Cluster)-[:FILAMENT {id, kind, weight}]->(:Cluster)`
- `(:GraphNode)-[:SIGNAL|TRADE {id, kind, weight}]->(:GraphNode)`

The API maps those Memgraph nodes and relationships back to the app's `GraphDataset` JSON contract.
