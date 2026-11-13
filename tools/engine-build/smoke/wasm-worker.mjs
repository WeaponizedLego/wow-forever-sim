// Worker thread for smoke.mjs: instantiates the engine WASM once, then runs protojson
// RaidSimRequests through raidSimJson as they arrive. Productionised from spike/run-wasm.mjs.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

const { wasmExec, module } = workerData;
createRequire(import.meta.url)(wasmExec); // defines globalThis.Go
const go = new globalThis.Go();
const instance = await WebAssembly.instantiate(module, go.importObject);
// The engine calls globalThis.wasmready() once its functions are registered. It must exist before
// go.run, or the engine panics.
const ready = new Promise((resolve) => {
  globalThis.wasmready = resolve;
});
go.run(instance);
await ready;

parentPort.on('message', ({ suite, requestPath }) => {
  const t0 = performance.now();
  try {
    const res = JSON.parse(globalThis.raidSimJson(readFileSync(requestPath, 'utf8')));
    const dps = res.raidMetrics?.dps ?? {};
    parentPort.postMessage({
      suite,
      ms: Math.round(performance.now() - t0),
      error: res.error ? JSON.stringify(res.error) : null,
      dps: dps.avg ?? 0,
      stdev: dps.stdev ?? 0,
      iterations: res.iterationsDone ?? 0,
    });
  } catch (e) {
    parentPort.postMessage({ suite, ms: Math.round(performance.now() - t0), error: String(e?.stack ?? e) });
  }
});
parentPort.postMessage({ ready: true });
