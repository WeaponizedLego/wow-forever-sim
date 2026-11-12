// Web Worker entry. Create with
//   new Worker(new URL('./worker.browser.ts', import.meta.url), { type: 'module' })
// (createBrowserEngineClient does this). Must be a module worker: it imports wasm_exec.js.
import type { HostMessage } from './protocol.ts';
import { serveEngine } from './worker-core.ts';

const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
serveEngine({
  postMessage: (msg, transfer = []) => scope.postMessage(msg, transfer),
  onMessage: (handler) =>
    scope.addEventListener('message', (e: MessageEvent<HostMessage>) => handler(e.data)),
});
