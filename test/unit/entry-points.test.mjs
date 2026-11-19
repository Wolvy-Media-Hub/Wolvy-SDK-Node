// The package loads the same way through import and require, from its "exports" map.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as esm from '@wolvy/node';
import EsmDefault from '@wolvy/node';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const require = createRequire(import.meta.url);

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? jsFiles(join(dir, entry.name)) : entry.name.endsWith('.js') ? [join(dir, entry.name)] : [],
  );
}

const PUBLIC = [
  'Wolvy',
  'signViewerToken',
  'verifyWebhook',
  'embedUrl',
  'WolvyError',
  'WolvyAPIError',
  'WolvyInvalidRequestError',
  'WolvyNotFoundError',
  'WolvyConflictError',
  'WolvyAuthenticationError',
  'WolvyPermissionError',
  'WolvyRateLimitError',
  'WolvyServerError',
  'WolvyConnectionError',
  'WolvyTimeoutError',
  'WolvySignatureVerificationError',
  'Page',
  'PagePromise',
  'VERSION',
  'WEBHOOK_EVENT_TYPES',
];

describe('entry points', () => {
  it('ESM: import exposes the public API and a default export', () => {
    for (const name of PUBLIC) assert.ok(name in esm, `missing ${name}`);
    assert.equal(EsmDefault, esm.Wolvy);
    assert.equal(esm.VERSION, pkg.version);
    assert.equal(esm.Wolvy.VERSION, pkg.version);
  });

  it('CJS: require exposes the same names', () => {
    const cjs = require('@wolvy/node');
    assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort());
    assert.equal(cjs.default, cjs.Wolvy);
    assert.equal(cjs.VERSION, pkg.version);
    assert.equal(typeof cjs.signViewerToken, 'function');
    assert.equal(
      cjs.signViewerToken('user-8813', 3600, 'd80d15d09b7c0e56b4d787f6a212ed8bf8d53c761b6df521278f030cb12a7781', { now: 1789996400 }),
      esm.signViewerToken('user-8813', 3600, 'd80d15d09b7c0e56b4d787f6a212ed8bf8d53c761b6df521278f030cb12a7781', { now: 1789996400 }),
    );
    const wolvy = new cjs.Wolvy({ apiKey: 'wv_live_x', fetch: async () => new Response('{}') });
    assert.equal(typeof wolvy.videos.list, 'function');
  });

  it('CJS in a plain CommonJS process (no ESM loader involved)', () => {
    const out = execFileSync(
      process.execPath,
      ['-e', "const w = require('@wolvy/node'); process.stdout.write([typeof w.Wolvy, typeof w.verifyWebhook, w.VERSION].join(' '))"],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(out, `function function ${pkg.version}`);
  });

  it('ships both builds with their type declarations, marked with their module type', () => {
    for (const [dir, type] of [['esm', 'module'], ['cjs', 'commonjs']]) {
      assert.ok(existsSync(join(root, 'dist', dir, 'index.js')));
      assert.ok(existsSync(join(root, 'dist', dir, 'index.d.ts')));
      assert.equal(JSON.parse(readFileSync(join(root, 'dist', dir, 'package.json'), 'utf8')).type, type);
    }
    const exp = pkg.exports['.'];
    assert.equal(exp.import.types, './dist/esm/index.d.ts');
    assert.equal(exp.require.types, './dist/cjs/index.d.ts');
    for (const file of [exp.import.default, exp.require.default, pkg.main, pkg.types]) {
      assert.ok(existsSync(join(root, file)), file);
    }
  });

  it('has no runtime dependencies, Node 18+ and the Apache-2.0 licence text', () => {
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.engines.node, '>=18');
    assert.equal(pkg.license, 'Apache-2.0');
    const licenceBytes = readFileSync(join(root, 'LICENSE'));
    // The canonical apache.org text, the same file in every Wolvy SDK repository.
    assert.equal(licenceBytes.length, 11358);
    assert.equal(createHash('sha256').update(licenceBytes).digest('hex'), 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30');
    const licence = licenceBytes.toString('utf8');
    assert.match(licence, /^\s+Apache License\n\s+Version 2\.0, January 2004\n/);
    assert.match(licence, /END OF TERMS AND CONDITIONS/);
    assert.match(licence, /limitations under the License\.\n$/);
  });

  it('the built code imports nothing but node: built-ins and its own files', () => {
    for (const dir of ['esm', 'cjs']) {
      for (const file of jsFiles(join(root, 'dist', dir))) {
        const src = readFileSync(file, 'utf8');
        const specs = [...src.matchAll(/^\s*(?:import|export)\b[^'"\n]*?from\s+['"]([^'"]+)['"]|\brequire\(['"]([^'"]+)['"]\)/gm)];
        for (const match of specs) {
          const spec = match[1] ?? match[2];
          assert.ok(spec.startsWith('node:') || spec.startsWith('./') || spec.startsWith('../'), `${file} imports ${spec}`);
        }
        if (file.endsWith('index.js')) assert.ok(specs.length > 5, 'the scan found the imports');
      }
    }
  });
});
