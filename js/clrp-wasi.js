/* clrp-wasi.js -- runs the CLRP engine (wasm32-wasi command module) with an in-memory file system.
   Works in a Web Worker / browser window and in Node (tests):   const r = await ClrpWasi.run(module, {files, args});
   files: {"data/P/x.dat": Uint8Array|string, ...} (paths relative to /kit)   ->   {exit, trapped, stdout, stderr, files: {path: Uint8Array}} */
(function (root) {
  'use strict';
  const E = { OK: 0, BADF: 8, EXIST: 20, INVAL: 28, NOENT: 44, NOTDIR: 54, ISDIR: 31, NOSYS: 52 };
  class ExitSignal { constructor(code) { this.code = code; } }
  const enc = new TextEncoder(), dec = new TextDecoder('utf-8');

  function normalise(p) {                         // "a/./b/../c" -> "a/c" ; no leading slash
    const out = [];
    for (const part of p.split('/')) { if (part === '' || part === '.') continue; if (part === '..') out.pop(); else out.push(part); }
    return out.join('/');
  }

  class Run {
    constructor(files, args, nowMs) {
      this.files = new Map(); this.dirs = new Set(['']); this.fds = new Map(); this.nextFd = 4;
      this.stdout = []; this.stderr = []; this.args = args; this.nowMs = nowMs; this.memory = null;
      this.t0 = this.nowMs();
      for (const [path, data] of Object.entries(files || {})) {
        const p = normalise(path); this.files.set(p, typeof data === 'string' ? enc.encode(data) : data);
        const parts = p.split('/'); parts.pop(); let cur = ''; for (const s of parts) { cur = cur ? cur + '/' + s : s; this.dirs.add(cur); }
      }
      this.fds.set(0, { kind: 'stdin' }); this.fds.set(1, { kind: 'out', sink: this.stdout }); this.fds.set(2, { kind: 'out', sink: this.stderr });
      this.fds.set(3, { kind: 'dir', path: '' });
    }
    view() { return new DataView(this.memory.buffer); }
    bytes() { return new Uint8Array(this.memory.buffer); }
    str(ptr, len) { return dec.decode(this.bytes().subarray(ptr, ptr + len)); }
    imports() {
      const self = this, ok = E.OK;
      const f = {
        args_sizes_get(argcPtr, sizePtr) { const v = self.view(); const a = self.args.map(s => enc.encode(s + '\0')); v.setUint32(argcPtr, a.length, true); v.setUint32(sizePtr, a.reduce((n, x) => n + x.length, 0), true); return ok; },
        args_get(argvPtr, bufPtr) { const v = self.view(), m = self.bytes(); let off = bufPtr; self.args.forEach((s, i) => { v.setUint32(argvPtr + 4 * i, off, true); const b = enc.encode(s + '\0'); m.set(b, off); off += b.length; }); return ok; },
        environ_sizes_get(cPtr, sPtr) { const v = self.view(); v.setUint32(cPtr, 0, true); v.setUint32(sPtr, 0, true); return ok; },
        environ_get() { return ok; },
        clock_time_get(id, _prec, outPtr) { const ms = id === 0 ? Date.now() : (self.nowMs() - self.t0 + 1000); self.view().setBigUint64(outPtr, BigInt(Math.round(ms * 1e6)), true); return ok; },
        proc_exit(code) { throw new ExitSignal(code); },
        fd_fdstat_get(fd, ptr) {
          const d = self.fds.get(fd); if (!d) return E.BADF; const v = self.view();
          v.setUint8(ptr, d.kind === 'dir' ? 3 : d.kind === 'file' ? 4 : 2); v.setUint16(ptr + 2, 0, true);
          v.setBigUint64(ptr + 8, 0xffffffffffffffffn, true); v.setBigUint64(ptr + 16, 0xffffffffffffffffn, true); return ok;
        },
        fd_fdstat_set_flags() { return ok; },
        fd_prestat_get(fd, ptr) { if (fd !== 3) return E.BADF; const v = self.view(); v.setUint8(ptr, 0); v.setUint32(ptr + 4, 4, true); return ok; },
        fd_prestat_dir_name(fd, ptr, len) { if (fd !== 3) return E.BADF; self.bytes().set(enc.encode('/kit').subarray(0, len), ptr); return ok; },
        fd_close(fd) { if (fd <= 3) return ok; return self.fds.delete(fd) ? ok : E.BADF; },
        fd_read(fd, iovs, n, outPtr) {
          const d = self.fds.get(fd); if (!d) return E.BADF; const v = self.view(), m = self.bytes(); let total = 0;
          if (d.kind === 'stdin') { v.setUint32(outPtr, 0, true); return ok; }
          if (d.kind !== 'file') return E.ISDIR;
          const data = self.files.get(d.path) || new Uint8Array(0);
          for (let i = 0; i < n; i++) {
            const base = v.getUint32(iovs + 8 * i, true), len = v.getUint32(iovs + 8 * i + 4, true);
            const k = Math.min(len, Math.max(0, data.length - d.pos)); if (k > 0) { m.set(data.subarray(d.pos, d.pos + k), base); d.pos += k; total += k; } if (k < len) break;
          }
          v.setUint32(outPtr, total, true); return ok;
        },
        fd_write(fd, iovs, n, outPtr) {
          const d = self.fds.get(fd); if (!d) return E.BADF; const v = self.view(), m = self.bytes(); let total = 0;
          for (let i = 0; i < n; i++) {
            const base = v.getUint32(iovs + 8 * i, true), len = v.getUint32(iovs + 8 * i + 4, true); if (!len) continue;
            const chunk = m.slice(base, base + len);                          // copy: memory may move
            if (d.kind === 'out') d.sink.push(chunk);
            else if (d.kind === 'file') {
              let data = self.files.get(d.path) || new Uint8Array(0); const end = d.pos + len;
              if (end > data.length) { const bigger = new Uint8Array(Math.max(end, data.length * 2, 64)); bigger.set(data); bigger.used = Math.max(data.used || 0, 0); data = bigger; }
              data.set(chunk, d.pos); d.pos = end; data.used = Math.max(data.used || 0, end); self.files.set(d.path, data);
            } else return E.BADF;
            total += len;
          }
          v.setUint32(outPtr, total, true); return ok;
        },
        fd_seek(fd, offset, whence, outPtr) {
          const d = self.fds.get(fd); if (!d || d.kind !== 'file') return d && d.kind === 'out' ? 70 : E.BADF;
          const data = self.files.get(d.path), size = data ? (data.used !== undefined ? data.used : data.length) : 0; const off = Number(offset);
          const np = whence === 0 ? off : whence === 1 ? d.pos + off : size + off; if (np < 0) return E.INVAL; d.pos = np; self.view().setBigUint64(outPtr, BigInt(np), true); return ok;
        },
        path_create_directory(fd, ptr, len) {
          const d = self.fds.get(fd); if (!d || d.kind !== 'dir') return E.BADF; const p = normalise(d.path + '/' + self.str(ptr, len));
          if (self.dirs.has(p) || self.files.has(p)) return E.EXIST; self.dirs.add(p); return ok;
        },
        path_filestat_get(fd, _flags, ptr, len, outPtr) {
          const d = self.fds.get(fd); if (!d || d.kind !== 'dir') return E.BADF; const p = normalise(d.path + '/' + self.str(ptr, len)); const v = self.view();
          let type, size = 0;
          if (self.dirs.has(p)) type = 3; else if (self.files.has(p)) { type = 4; const x = self.files.get(p); size = x.used !== undefined ? x.used : x.length; } else return E.NOENT;
          for (let i = 0; i < 64; i += 8) v.setBigUint64(outPtr + i, 0n, true);
          v.setUint8(outPtr + 16, type); v.setBigUint64(outPtr + 24, 1n, true); v.setBigUint64(outPtr + 32, BigInt(size), true); return ok;
        },
        path_open(fd, _dirflags, ptr, len, oflags, _rb, _ri, fdflags, outPtr) {
          const d = self.fds.get(fd); if (!d || d.kind !== 'dir') return E.BADF; const p = normalise(d.path + '/' + self.str(ptr, len));
          const CREAT = 1, DIRECTORY = 2, EXCL = 4, TRUNC = 8, APPEND = 1;
          const isDir = self.dirs.has(p), isFile = self.files.has(p);
          let nfd = self.nextFd++;
          if (oflags & DIRECTORY) { if (!isDir) return isFile ? E.NOTDIR : E.NOENT; self.fds.set(nfd, { kind: 'dir', path: p }); }
          else {
            if (isDir) return E.ISDIR;
            if (!isFile) { if (!(oflags & CREAT)) return E.NOENT; const parent = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''; if (!self.dirs.has(parent)) return E.NOENT; const z = new Uint8Array(64); z.used = 0; self.files.set(p, z); }
            else if (oflags & EXCL && oflags & CREAT) return E.EXIST;
            if (oflags & TRUNC) { const z = new Uint8Array(64); z.used = 0; self.files.set(p, z); }
            const x = self.files.get(p); self.fds.set(nfd, { kind: 'file', path: p, pos: (fdflags & APPEND) ? (x.used !== undefined ? x.used : x.length) : 0 });
          }
          self.view().setUint32(outPtr, nfd, true); return ok;
        },
      };
      return { wasi_snapshot_preview1: f };
    }
    collect() {
      const out = {};
      for (const [p, d] of this.files) out[p] = d.used !== undefined ? d.subarray(0, d.used) : d;
      return out;
    }
  }

  function concat(chunks) { let n = 0; for (const c of chunks) n += c.length; const o = new Uint8Array(n); let k = 0; for (const c of chunks) { o.set(c, k); k += c.length; } return dec.decode(o); }

  async function run(wasmModule, opts) {
    const nowMs = opts.nowMs || (typeof performance !== 'undefined' ? () => performance.now() : () => Date.now());
    const r = new Run(opts.files || {}, ['clrp'].concat(opts.args || []), nowMs);
    const inst = await WebAssembly.instantiate(wasmModule, r.imports());
    r.memory = inst.exports.memory;
    let exit = 0, trapped = false, trapMsg = '';
    try { inst.exports._start(); }
    catch (e) {
      if (e instanceof ExitSignal) exit = e.code;
      else { trapped = true; exit = 134; trapMsg = String(e && e.message || e); }
    }
    return { exit, trapped, trapMsg, stdout: concat(r.stdout), stderr: concat(r.stderr), files: r.collect() };
  }
  const api = { run, normalise };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ClrpWasi = api;
})(typeof self !== 'undefined' ? self : globalThis);
