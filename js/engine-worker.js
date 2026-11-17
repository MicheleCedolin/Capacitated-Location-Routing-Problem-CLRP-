/* engine-worker.js -- one Web Worker = one solver slot. Every job starts a fresh WebAssembly instance of the engine, so seeds never share state. */
importScripts('clrp-wasi.js');
let mod = null;
self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === 'init') { mod = m.module; self.postMessage({ type: 'ready' }); return; }
  if (m.type !== 'job') return;
  const t0 = performance.now();
  let out;
  try {
    const r = await ClrpWasi.run(mod, { files: m.files, args: m.args });
    const keep = {}, transfer = [];
    for (const [p, d] of Object.entries(r.files)) if (p.startsWith('res/')) { const c = d.slice(); keep[p] = c; transfer.push(c.buffer); }
    out = { type: 'done', id: m.id, exit: r.exit, trapped: r.trapped, trapMsg: r.trapMsg, stderr: r.stderr, stdout: r.stdout, files: keep, wall_ms: performance.now() - t0 };
    self.postMessage(out, transfer);
  } catch (e) {
    self.postMessage({ type: 'done', id: m.id, exit: 134, trapped: true, trapMsg: String(e && e.message || e), stderr: '', stdout: '', files: {}, wall_ms: performance.now() - t0 });
  }
};
