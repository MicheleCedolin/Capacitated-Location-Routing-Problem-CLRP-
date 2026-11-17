/* engine.js -- runs the CLRP engine (WebAssembly) for a list of seeds on a pool of Web Workers and parses what comes back. */
const Engine = (() => {
  // ---- SHA-1 (only to name custom operator lists the same way as the desktop app: "ops" + first 8 hex digits of SHA-1 of "op1,op2,...")
  function sha1hex(str) {
    const enc = new TextEncoder().encode(str), l = enc.length, nb = ((l + 8) >> 6) + 1, w = new Uint32Array(nb * 16);
    for (let i = 0; i < l; i++) w[i >> 2] |= enc[i] << (24 - 8 * (i & 3));
    w[l >> 2] |= 0x80 << (24 - 8 * (l & 3)); w[nb * 16 - 1] = l * 8;
    let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0; const x = new Uint32Array(80);
    const rol = (v, s) => (v << s) | (v >>> (32 - s));
    for (let b = 0; b < nb; b++) {
      for (let i = 0; i < 16; i++) x[i] = w[b * 16 + i];
      for (let i = 16; i < 80; i++) x[i] = rol(x[i - 3] ^ x[i - 8] ^ x[i - 14] ^ x[i - 16], 1);
      let a = h0, bb = h1, c = h2, d = h3, e = h4;
      for (let i = 0; i < 80; i++) {
        const f = i < 20 ? (bb & c) | (~bb & d) : i < 40 ? bb ^ c ^ d : i < 60 ? (bb & c) | (bb & d) | (c & d) : bb ^ c ^ d;
        const k = i < 20 ? 0x5A827999 : i < 40 ? 0x6ED9EBA1 : i < 60 ? 0x8F1BBCDC : 0xCA62C1D6;
        const t = (rol(a, 5) + f + e + k + x[i]) >>> 0; e = d; d = c; c = rol(bb, 30); bb = a; a = t;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    return [h0, h1, h2, h3, h4].map(v => v.toString(16).padStart(8, '0')).join('');
  }
  const aliasName = ops => 'ops' + sha1hex(ops.join(',')).slice(0, 8);
  const fmtG = v => { let s = String(+v.toPrecision(12)); return s; };

  // ---- argument list of one seed (mirrors the desktop app, which mirrors run_clrp.py)
  function buildArgs(spec, seed, catalog) {
    const a = ['--kit-root', '/kit'];
    if (spec.custom) a.push('--instance-file', spec.instance + '=/kit/' + spec.custom.path); else a.push('--instances', spec.instance);
    a.push('--seeds', String(seed), '--heuristic', spec.heuristic, '--local-search', spec.local_search, '--neighborhoods', spec.neighborhoods, '--budget-mode', 'fixed_time',
           '--time-limit', fmtG(spec.time_limit), '--checkpoints', spec.checkpoints);
    for (const k of Object.keys(spec.params).sort()) {
      const ps = catalog.params[k]; if (!ps) continue; const v = spec.params[k];
      if (ps.type === 'bool') { if (v) a.push(ps.flag); } else a.push(ps.flag, ps.type === 'float' && Number.isInteger(+v) ? (+v).toFixed(1) : String(v));
    }
    a.push('--out-dir', '/kit/res');
    if (spec.local_search !== 'none' && !catalog.presets.some(p => p.id === spec.neighborhoods)) a.unshift('--alias', spec.neighborhoods + '=' + spec.operators.join(','));
    return a;
  }

  // ---- minimal CSV
  function parseCsv(text) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    const head = rows.shift() || []; return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
  }

  // ---- worker pool
  let modPromise = null;
  function getModule() {
    if (!modPromise) modPromise = (async () => {
      try { return await WebAssembly.compileStreaming(fetch('wasm/clrp.wasm')); }
      catch (e) { const r = await fetch('wasm/clrp.wasm'); return WebAssembly.compile(await r.arrayBuffer()); }
    })();
    return modPromise;
  }
  class Pool {
    constructor(n) { this.n = n; this.workers = []; this.idle = []; this.queue = []; this.pending = new Map(); this.dead = false; this.nextId = 1; }
    async start() {
      const module = await getModule();
      await Promise.all(Array.from({ length: this.n }, () => new Promise(res => {
        const w = new Worker('js/engine-worker.js'); this.workers.push(w);
        w.onmessage = ev => {
          const m = ev.data;
          if (m.type === 'ready') { this.idle.push(w); res(); this.pump(); }
          else if (m.type === 'done') { const p = this.pending.get(m.id); this.pending.delete(m.id); this.idle.push(w); if (p) p.resolve(m); this.pump(); }
        };
        w.onerror = ev => { ev.preventDefault && ev.preventDefault(); };
        w.postMessage({ type: 'init', module });
      })));
    }
    submit(files, args) { return new Promise((resolve, reject) => { if (this.dead) return reject(new Error('cancelled')); this.queue.push({ files, args, resolve, reject }); this.pump(); }); }
    pump() {
      while (!this.dead && this.idle.length && this.queue.length) {
        const w = this.idle.pop(), j = this.queue.shift(), id = this.nextId++; this.pending.set(id, j);
        w.postMessage({ type: 'job', id, files: j.files, args: j.args });
      }
    }
    cancel() { this.dead = true; for (const w of this.workers) w.terminate(); for (const j of this.queue) j.reject(new Error('cancelled')); for (const p of this.pending.values()) p.reject(new Error('cancelled')); this.queue = []; this.pending.clear(); }
    close() { for (const w of this.workers) w.terminate(); }
  }

  const dec = new TextDecoder();
  const text = (files, suffix) => { const k = Object.keys(files).find(p => p.endsWith(suffix)); return k ? dec.decode(files[k]) : ''; };

  // Run all seeds. ctx = {catalog, instBytes: Uint8Array, refRecord}. onSeed(result) is called as each seed finishes.
  async function runSeeds(spec, ctx, onSeed, onStart) {
    const pool = new Pool(Math.max(1, Math.min(spec.workers, spec.seeds.length)));
    const handle = { cancel: () => pool.cancel() };
    handle.done = (async () => {
      await pool.start(); if (onStart) onStart();
      const shared = {};
      if (spec.custom) shared[spec.custom.path] = ctx.instBytes;
      else { shared[`data/${spec.fam}/${spec.file}`] = ctx.instBytes; shared['reference/CLRP_reference.json'] = JSON.stringify([ctx.refRecord]); }
      const jobs = spec.seeds.map(seed => (async () => {
        const args = buildArgs(spec, seed, ctx.catalog);
        let r; try { r = await pool.submit(Object.assign({}, shared), args); } catch (e) { return { seed, status: 'cancelled' }; }
        const res = { seed, wall_s: r.wall_ms / 1000, exit: r.exit };
        if (r.exit !== 0 || r.trapped) { res.status = 'error'; res.error = ((r.stderr || '').trim() || r.trapMsg || (r.stdout || '').trim() || 'engine failed').toString().split('\n').filter(Boolean).slice(-1)[0].slice(0, 300); res.log = r.stderr + r.stdout; }
        else {
          const sol = text(r.files, '.solution.json'); const summ = parseCsv(text(r.files, 'summary.csv'))[0] || {}; const traj = parseCsv(text(r.files, 'trajectory.csv'));
          let sj = null; try { sj = JSON.parse(sol); } catch (e) { /* none */ }
          res.status = sj && sj.status ? sj.status : (summ.status || 'ok'); res.solution = sj; res.summary = summ; res.trajectory = traj; res.sol_txt = text(r.files, '.sol.txt'); res.log = r.stderr + r.stdout;
          if (sj) { res.objective = sj.objective; res.gap = sj.gap_pct; res.components = sj.objective_components; res.tbest = sj.time_to_best_s; }
        }
        onSeed(res); return res;
      })());
      const out = await Promise.all(jobs); pool.close(); return out;
    })();
    return handle;
  }
  return { sha1hex, aliasName, buildArgs, parseCsv, runSeeds, getModule, fmtG };
})();
if (typeof module !== 'undefined') module.exports = Engine;
