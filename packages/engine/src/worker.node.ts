// Node worker_threads entry, run by Node's native TypeScript type stripping (Node >= 22.18 / 24).
import { parentPort } from 'node:worker_threads';
import type { HostMessage } from './protocol.ts';
import { serveEngine } from './worker-core.ts';

const port = parentPort;
if (!port) throw new Error('worker.node.ts must run inside a worker_threads Worker');
serveEngine({
  postMessage: (msg, transfer = []) => port.postMessage(msg, transfer),
  onMessage: (handler) => port.on('message', (msg: HostMessage) => handler(msg)),
});
