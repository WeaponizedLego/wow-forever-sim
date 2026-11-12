// Phase 0 spike: run the engine WASM in Node with a protojson RaidSimRequest.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const [wasmExec, wasmPath, reqPath, outPath] = process.argv.slice(2);
createRequire(import.meta.url)(wasmExec); // defines globalThis.Go
const go = new globalThis.Go();
const t0 = performance.now();
const { instance } = await WebAssembly.instantiate(readFileSync(wasmPath), go.importObject);
const ready = new Promise((r) => {
  globalThis.wasmready = r;
});
go.run(instance);
await ready;
const t1 = performance.now();
const out = globalThis.raidSimJson(readFileSync(reqPath, 'utf8'));
const t2 = performance.now();
writeFileSync(outPath, out);
const r = JSON.parse(out);
if (r.error) console.log('ERROR', JSON.stringify(r.error));
const d = r.raidMetrics?.dps ?? {};
console.log(
  JSON.stringify({
    loadMs: Math.round(t1 - t0),
    simMs: Math.round(t2 - t1),
    dps: d.avg,
    stdev: d.stdev,
    iterations: r.iterationsDone,
    allValues: d.allValues?.length,
    logsBytes: r.logs?.length,
  }),
);
process.exit(0);
