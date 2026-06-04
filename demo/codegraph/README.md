# CodeGraph Demo

Visualize this repository's [CodeGraph](https://www.npmjs.com/package/codegraph) index in the Galaxy Nodes demo.

## Local setup

```bash
codegraph init -i   # or codegraph sync after edits
npm run codegraph:export
npm run dev
```

Open the demo and click the **CodeGraph** button (file-with-code icon) in the left toolbar. Click again to reload after re-exporting.

The export script reads `.codegraph/codegraph.db` and writes `examples/basic/public/codegraph-dataset.json` (gitignored; regenerated locally and in CI).

## Options

```bash
npm run codegraph:export -- --edge-kinds calls,references
npm run codegraph:export -- --node-kinds function,class,interface,file
```

## GitHub Pages

The Pages workflow runs `npx codegraph@latest init -i` and `npm run codegraph:export` before building the demo, so the hosted playground includes an up-to-date code-intelligence graph without committing the SQLite database or JSON snapshot.
