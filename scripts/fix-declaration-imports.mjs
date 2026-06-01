import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const declarationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../temp/declarations');
const relativeSpecifierPattern = /((?:from\s*|import\s*\(\s*)['"])(\.{1,2}\/[^'"]+)(['"])/g;
const checkOnly = process.argv.includes('--check');
const staleFiles = [];

function needsJsExtension(specifier) {
  return path.posix.extname(specifier) === '' && !specifier.endsWith('/');
}

async function* declarationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      yield* declarationFiles(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      yield fullPath;
    }
  }
}

for await (const filePath of declarationFiles(declarationDir)) {
  const original = await readFile(filePath, 'utf8');
  const updated = original.replace(relativeSpecifierPattern, (match, prefix, specifier, suffix) => {
    if (!needsJsExtension(specifier)) {
      return match;
    }

    return `${prefix}${specifier}.js${suffix}`;
  });

  if (updated !== original) {
    if (checkOnly) {
      staleFiles.push(path.relative(declarationDir, filePath));
    } else {
      await writeFile(filePath, updated);
    }
  }
}

if (staleFiles.length > 0) {
  console.error(`Declaration imports need normalization:\n${staleFiles.map((file) => `- ${file}`).join('\n')}`);
  process.exitCode = 1;
}
