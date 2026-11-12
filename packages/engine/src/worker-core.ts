// The engine worker, independent of the host environment. worker.browser.ts (Web Worker) and
// worker.node.ts (worker_threads) wire it to their message port.
//
// Only erasable TypeScript here: Node runs this file with native type stripping.
import { ASYNC_METHODS, type EngineMethod, type HostMessage, type WorkerMessage } from './protocol.ts';

export interface WorkerPort {
  postMessage(msg: WorkerMessage, transfer?: ArrayBuffer[]): void;
  onMessage(handler: (msg: HostMessage) => void): void;
}

interface GoInstance {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
  exited: boolean;
}
type EngineFn = (payload: Uint8Array, ...rest: unknown[]) => Uint8Array | null | undefined;

const asyncMethods = new Set<string>(ASYNC_METHODS);
const g = globalThis as unknown as Record<string, unknown> & {
  Go?: new () => GoInstance;
  wasmready?: () => void;
  fs?: { writeSync: (fd: number, buf: Uint8Array) => number };
};

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
// Transfer the reply's buffer when the view covers all of it (the engine's replies always do).
const transferOf = (bytes: Uint8Array): ArrayBuffer[] =>
  bytes.byteOffset === 0 &&
  bytes.byteLength === bytes.buffer.byteLength &&
  bytes.buffer instanceof ArrayBuffer
    ? [bytes.buffer]
    : [];

export function serveEngine(port: WorkerPort): void {
  let go: GoInstance | undefined;
  const exited = () => go?.exited === true;
  const pending: HostMessage[] = [];
  let ready = false;

  const fail = (id: number, message: string) => port.postMessage({ type: 'error', id, message });

  const call = (msg: Extract<HostMessage, { type: 'call' }>) => {
    const { id, method, payload, requestId } = msg;
    if (exited()) return fail(id, 'The engine runtime has exited.');
    const fn = g[method] as EngineFn | undefined;
    if (typeof fn !== 'function') return fail(id, `The engine has no function ${method}.`);
    try {
      if (asyncMethods.has(method)) {
        // Progress (and the final result inside the last ProgressMetrics) arrives through the callback.
        // The engine registers the request id for abortById before this call returns to JS.
        fn(
          payload,
          (progress: Uint8Array) =>
            port.postMessage({ type: 'progress', id, payload: progress }, transferOf(progress)),
          requestId ?? '',
        );
        port.postMessage({ type: 'result', id, payload: new Uint8Array(0) });
      } else {
        const out = fn(payload);
        if (exited()) return fail(id, `The engine runtime exited while answering ${method}.`);
        // The engine logs and answers nothing when it cannot parse a request.
        if (!(out instanceof Uint8Array))
          return fail(id, `${method} returned no result (the request did not parse).`);
        port.postMessage({ type: 'result', id, payload: out }, transferOf(out));
      }
    } catch (e) {
      fail(id, `${method as EngineMethod}: ${errorMessage(e)}`);
    }
  };

  const init = async (msg: Extract<HostMessage, { type: 'init' }>) => {
    try {
      // wasm_exec.js is a plain script that defines globalThis.Go; importing it as a module runs it.
      await import(/* @vite-ignore */ msg.wasmExecUrl);
      if (!g.Go) throw new Error('wasm_exec.js did not define globalThis.Go');
      if (!msg.engineLogs && g.fs) g.fs.writeSync = (_fd, buf) => buf.length;
      go = new g.Go();
      const instance = await WebAssembly.instantiate(msg.module, go.importObject);
      // The engine calls wasmready() once it has registered its functions; without it, it panics.
      const engineReady = new Promise<void>((resolve) => (g.wasmready = resolve));
      void go.run(instance).then(() => {
        port.postMessage({ type: 'exit', message: 'The engine runtime exited (unrecovered panic?).' });
      });
      await engineReady;
      ready = true;
      port.postMessage({ type: 'ready' });
      for (const m of pending.splice(0)) if (m.type === 'call') call(m);
    } catch (e) {
      port.postMessage({ type: 'initError', message: errorMessage(e) });
    }
  };

  port.onMessage((msg) => {
    if (msg.type === 'init') void init(msg);
    else if (!ready) pending.push(msg);
    else call(msg);
  });
}
