import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await mkdir(path.join(projectFolder, 'coverage/.tmp'), { recursive: true });
