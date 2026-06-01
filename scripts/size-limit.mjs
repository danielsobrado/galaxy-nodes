import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const sizeLimitBin = path.join(projectRoot, 'node_modules/size-limit/bin.js');

function resolvePattern(pattern) {
  const normalized = pattern.replace(/\\/g, '/');
  const starIndex = normalized.indexOf('*');
  if (starIndex === -1) return [path.join(projectRoot, normalized)];

  const directory = path.join(projectRoot, normalized.slice(0, normalized.lastIndexOf('/', starIndex)));
  const basename = normalized.slice(normalized.lastIndexOf('/', starIndex) + 1);
  const [prefix, suffix] = basename.split('*');
  return readdirSync(directory)
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith(suffix))
    .map((entry) => path.join(directory, entry));
}

for (const entry of packageJson['size-limit'] ?? []) {
  const matches = resolvePattern(entry.path);
  if (matches.length !== 1) {
    console.error(`Expected "${entry.path}" to resolve to one file for ${entry.name}, found ${matches.length}.`);
    if (matches.length > 1) console.error(matches.map((match) => `- ${path.relative(projectRoot, match)}`).join('\n'));
    process.exit(1);
  }

  console.log(`Checking ${entry.name}: ${path.relative(projectRoot, matches[0])}`);
  execFileSync(process.execPath, [sizeLimitBin, matches[0], '--limit', entry.limit], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
}
