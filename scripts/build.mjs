// Build dist/esm (ES modules) and dist/cjs (CommonJS), each with its .d.ts files, using tsc.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');

rmSync(join(root, 'dist'), { recursive: true, force: true });

for (const project of ['tsconfig.json', 'tsconfig.cjs.json']) {
  const result = spawnSync(process.execPath, [tsc, '-p', join(root, project)], { stdio: 'inherit', cwd: root });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The package is "type": "module"; mark each output folder so Node reads it in the right format.
for (const [dir, type] of [['esm', 'module'], ['cjs', 'commonjs']]) {
  mkdirSync(join(root, 'dist', dir), { recursive: true });
  writeFileSync(join(root, 'dist', dir, 'package.json'), `${JSON.stringify({ type }, null, 2)}\n`);
}
console.log('built dist/esm and dist/cjs');
