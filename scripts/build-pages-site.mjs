import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const siteDir = process.argv[2] ?? process.env.SITE_DIR ?? '.site';
const demoSource = 'examples/basic/dist';
const demoTarget = path.join(siteDir, 'demo');
const apiSource = 'docs/api';
const apiTarget = path.join(siteDir, 'api');
const isDocsMode = path.resolve(siteDir) === path.resolve('docs');

if (!existsSync(demoSource)) {
  throw new Error(`Missing ${demoSource}. Run npm run build:example first.`);
}

await mkdir(siteDir, { recursive: true });
await rm(demoTarget, { recursive: true, force: true });
if (!isDocsMode) {
  await rm(apiTarget, { recursive: true, force: true });
}
await rm(path.join(siteDir, 'index.html'), { force: true });
await rm(path.join(siteDir, '.nojekyll'), { force: true });

await cp(demoSource, demoTarget, { recursive: true });

if (existsSync(path.join(apiSource, 'index.html'))) {
  if (!isDocsMode) {
    await cp(apiSource, apiTarget, { recursive: true });
  }
}

await writeFile(
  path.join(siteDir, 'index.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Galaxy Nodes</title>
    <style>
      :root {
        color-scheme: dark;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #080b10;
        color: #eef7f4;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
      }

      main {
        width: min(720px, calc(100vw - 32px));
      }

      h1 {
        margin: 0 0 12px;
        font-size: clamp(2.25rem, 6vw, 4rem);
        line-height: 0.95;
      }

      p {
        margin: 0 0 28px;
        color: #b5c7c1;
        font-size: 1.06rem;
        line-height: 1.6;
      }

      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      a {
        border: 1px solid #26343b;
        border-radius: 8px;
        color: #f8fffc;
        padding: 12px 16px;
        text-decoration: none;
      }

      a:focus,
      a:hover {
        border-color: #67e8c9;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Galaxy Nodes</h1>
      <p>Reusable React and Three.js graph visualization primitives, packaged with a live demo and generated API reference.</p>
      <nav>
        <a href="./demo/">Open live demo</a>
        <a href="./api/">Read API reference</a>
        <a href="https://github.com/danielsobrado/galaxy-nodes">GitHub repository</a>
      </nav>
    </main>
  </body>
</html>
`,
);

await writeFile(path.join(siteDir, '.nojekyll'), '');
