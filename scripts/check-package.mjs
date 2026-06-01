import { execSync } from 'node:child_process';

const requiredFiles = new Set([
  'package/dist/index.js',
  'package/dist/index.cjs',
  'package/dist/index.d.ts',
  'package/dist/core.js',
  'package/dist/core.cjs',
  'package/dist/core.d.ts',
  'package/dist/react.js',
  'package/dist/react.cjs',
  'package/dist/react.d.ts',
  'package/dist/styles.css',
  'package/README.md',
  'package/CHANGELOG.md',
  'package/CONTRIBUTING.md',
  'package/CODE_OF_CONDUCT.md',
  'package/SECURITY.md',
  'package/docs/release-policy.md',
  'package/LICENSE',
]);

const forbiddenPrefixes = [
  'package/src/',
  'package/examples/',
  'package/node_modules/',
  'package/temp/',
  'package/coverage/',
  'package/docs/api/',
  'package/.github/',
];

const output = execSync('npm pack --dry-run --json', {
  encoding: 'utf8',
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const [pack] = JSON.parse(output);
const files = new Set(pack.files.map((entry) => `package/${entry.path.replace(/\\/g, '/')}`));
const missing = [...requiredFiles].filter((file) => !files.has(file));
const forbidden = [...files].filter((file) => forbiddenPrefixes.some((prefix) => file.startsWith(prefix)));

if (missing.length || forbidden.length) {
  if (missing.length) console.error(`Missing package files:\n${missing.map((file) => `- ${file}`).join('\n')}`);
  if (forbidden.length) console.error(`Forbidden package files:\n${forbidden.map((file) => `- ${file}`).join('\n')}`);
  process.exit(1);
}

console.log(`Package contents OK: ${pack.files.length} files, ${Math.round(pack.unpackedSize / 1024)} KiB unpacked.`);
