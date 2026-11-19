// node --test with explicit file names, which every Node version from 18 on accepts the same way.
//   node scripts/run-tests.mjs unit | integration | all
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const suites = { unit: ['test/unit'], integration: ['test/integration'], all: ['test/unit', 'test/integration'] };
const which = process.argv[2] ?? 'unit';
if (!suites[which]) {
  console.error(`unknown suite "${which}"; use unit, integration or all`);
  process.exit(2);
}
const files = suites[which].flatMap((dir) =>
  readdirSync(join(root, dir))
    .filter((name) => /\.test\.(mjs|cjs|js)$/.test(name))
    .sort()
    .map((name) => join(dir, name)),
);
// Unit test files run in parallel. Integration files share one database, so they run one after
// the other.
if (which === 'unit') {
  const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: root });
  process.exit(result.status ?? 1);
}
let status = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--test', file], { stdio: 'inherit', cwd: root });
  if (result.status !== 0) status = result.status ?? 1;
}
process.exit(status);
