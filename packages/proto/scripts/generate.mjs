// Generates src/generated/*.ts from proto/*.proto with protobuf-ts.
// The pipeline (lane L1) copies the pinned upstream commit's proto/ here first.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src/generated');
const plugin = join(
  dirname(createRequire(import.meta.url).resolve('@protobuf-ts/plugin/package.json')),
  'bin/protoc-gen-ts',
);
const protos = readdirSync(join(root, 'proto')).filter((f) => f.endsWith('.proto'));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
execFileSync(
  'protoc',
  [
    `--plugin=protoc-gen-ts=${plugin}`,
    '--ts_out',
    out,
    '--ts_opt',
    'generate_dependencies,long_type_number,ts_nocheck',
    '--proto_path',
    join(root, 'proto'),
    ...protos,
  ],
  { stdio: 'inherit' },
);
console.log(`generated ${protos.length} protos → src/generated`);
