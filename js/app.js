/* app.js -- Solver page of the CLRP site. */
(async function () {
  const $ = id => document.getElementById(id), esc = Charts.esc, num = Charts.num;
  const toast = msg => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); };
  let catalog, manifest;
  try {
    [catalog, manifest] = await Promise.all([fetch('data/catalog.json').then(r => r.json()), fetch('data/instances.json').then(r => r.json())]);
  } catch (e) { $('boot').innerHTML = '<span class="err">Could not load the data files. Serve this folder over HTTP (for example with “python -m http.server”) or open the GitHub Pages address.</span>'; return; }
  if (typeof WebAssembly === 'undefined' || typeof Worker === 'undefined') { $('boot').innerHTML = '<span class="err">This browser does not support WebAssembly and Web Workers.</span>'; return; }
  $('boot').hidden = true;
  const byId = Object.fromEntries(manifest.map(o => [o.id, o])), H = Object.fromEntries(catalog.heuristics.map(h => [h.id, h])), OP = Object.fromEntries(catalog.operators.map(o => [o.id, o])), PRESET = Object.fromEntries(catalog.presets.map(p => [p.id, p]));
  const state = { inst: null, bytes: null, custom: null, ops: [], results: [], runSpec: null, running: null, instCache: {} };

  // ---------- 1. instance
  const GROUPS = [['P20', 'P set, 20 customers (Prodhon)'], ['P50', 'P set, 50 customers'], ['P100', 'P set, 100 customers'], ['P200', 'P set, 200 customers'], ['B', 'B set (Christofides, Gaspelle, Min, Das, Perl)'], ['T', 'T set (Tuzun and Burke)']];
  $('inst-sel').innerHTML = GROUPS.map(([g, t]) => `<optgroup label="${esc(t)}">` + manifest.filter(o => o.group === g).map(o => `<option value="${o.id}">${esc(o.label || o.id)} — ${o.n} customers, ${o.m} depots</option>`).join('') + '</optgroup>').join('');
  function parseDat(text) {                       // same block layout as the benchmark files: blank-line separated blocks
    const blocks = []; let cur = [];
    for (const l of text.split(/\r?\n/)) { if (l.trim() === '') { if (cur.length) { blocks.push(cur); cur = []; } } else cur.push(l); }
    if (cur.length) blocks.push(cur);
    const nm = blocks[0].join(' ').trim().split(/\s+/).map(Number), n = nm[0], m = nm[1];
    const rows = b => b.map(l => l.trim().split(/\s+/).map(Number)), first = b => b.map(l => +l.trim().split(/\s+/)[0]);
    let dep, cus, Q, dcap, dem, oc, vc;
    if (blocks[1].length === m && blocks[2].length === n) { dep = rows(blocks[1]); cus = rows(blocks[2]); Q = first(blocks[3])[0]; dcap = first(blocks[4]); dem = first(blocks[5]); oc = first(blocks[6]); vc = first(blocks[7])[0]; }
    else if (blocks[1].length === m + n) { const r = rows(blocks[1]); dep = r.slice(0, m); cus = r.slice(m); Q = first(blocks[2])[0]; dcap = first(blocks[3]); dem = first(blocks[4]); oc = first(blocks[5]); vc = first(blocks[6])[0]; }
    else throw new Error('the block layout is not one of the benchmark layouts');
    if (dep.length !== m || cus.length !== n || dcap.length !== m || dem.length !== n || oc.length !== m) throw new Error('the numbers of depots and customers do not match the header');
    return { n, m, Q, vcost: vc, dep: dep.map(d => [d[0], d[1]]), cus: cus.map((c, i) => [c[0], c[1], dem[i]]), dcap, dopen: oc };
  }
  function parseJsonInst(text) {
    const d = JSON.parse(text); if (!d.customers || !d.depots) throw new Error('the file needs “customers” and “depots” lists');
    const pos = (a, k) => { for (const x of a) for (const f of k) if (!(typeof x[f] === 'number' && isFinite(x[f]))) throw new Error('every customer needs x, y, demand; every depot needs x, y, capacity, costs'); };
    pos(d.customers, ['x', 'y', 'demand']); pos(d.depots, ['x', 'y', 'capacity', 'costs']); if (!(d.vehicle_capacity > 0) || typeof d.vehicle_costs !== 'number') throw new Error('“vehicle_capacity” and “vehicle_costs” are needed');
    return { n: d.customers.length, m: d.depots.length, Q: d.vehicle_capacity, vcost: d.vehicle_costs, dep: d.depots.map(x => [x.x, x.y]), cus: d.customers.map(x => [x.x, x.y, x.demand]), dcap: d.depots.map(x => x.capacity), dopen: d.depots.map(x => x.costs) };
  }
  function setInfo() {
    const i = state.inst; if (!i) { $('inst-info').textContent = ''; $('inst-map').hidden = true; return; }
    const tot = i.cus.reduce((a, c) => a + c[2], 0);
    $('inst-info').textContent = `${i.n} customers · ${i.m} depots · vehicle capacity ${num(i.Q)} · total demand ${num(tot)}` + (i.vcost !== undefined ? ` · vehicle cost ${num(i.vcost, 2)}` : '') + (i.bks ? ` · best known ${num(i.bks, 2)}` : ' · no best known value');
    $('inst-map').hidden = false; Charts.instanceMap($('inst-map'), i);
  }
  async function loadBuiltin(id) {
    const o = byId[id]; const url = `data/instances/${o.file}`;
    if (!state.instCache[id]) state.instCache[id] = new Uint8Array(await (await fetch(url)).arrayBuffer());
    state.inst = o; state.bytes = state.instCache[id]; state.custom = null; setInfo(); updateEst();
  }
  $('inst-sel').onchange = () => loadBuiltin($('inst-sel').value);
  document.querySelectorAll('input[name=isrc]').forEach(r => r.onchange = () => {
    const up = document.querySelector('input[name=isrc]:checked').value === 'upload'; $('inst-builtin').hidden = up; $('inst-upload').hidden = !up;
    if (up) { state.inst = null; state.bytes = null; state.custom = null; setInfo(); $('up-file').value = ''; } else loadBuiltin($('inst-sel').value);
  });
  $('up-file').onchange = async () => {
    const f = $('up-file').files[0]; $('up-err').textContent = ''; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { $('up-err').textContent = 'The file is larger than 5 MB.'; return; }
    try {
      const text = await f.text(), isJson = /\.json$/i.test(f.name) || text.trim().startsWith('{'); const g = isJson ? parseJsonInst(text) : parseDat(text);
      if (g.n < 2 || g.m < 1) throw new Error('an instance needs at least 2 customers and 1 depot'); if (g.n > 500 || g.m > 50) throw new Error('at most 500 customers and 50 depots are accepted');
      const name = 'upload-' + f.name.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 24), path = isJson ? 'upload/' + name + '.json' : 'upload/P/' + name + '.dat';
      state.inst = Object.assign(g, { id: name, family: 'U', bks: null }); state.bytes = new TextEncoder().encode(text); state.custom = { path }; setInfo(); updateEst();
    } catch (e) { state.inst = null; state.bytes = null; state.custom = null; setInfo(); $('up-err').textContent = 'Cannot read this file: ' + e.message; }
  };
  $('up-example').onclick = () => {
    const ex = { vehicle_capacity: 40, vehicle_costs: 20, depots: [{ x: 10, y: 10, capacity: 70, costs: 100 }, { x: 90, y: 80, capacity: 70, costs: 120 }], customers: [[20, 15, 12], [30, 40, 9], [15, 70, 15], [60, 20, 10], [80, 60, 14], [85, 90, 11], [50, 50, 8], [70, 85, 13]].map(([x, y, demand]) => ({ x, y, demand })) };
    download('clrp_example_instance.json', JSON.stringify(ex, null, 1), 'application/json');
  };

  // ---------- 2. heuristic
  const fams = catalog.families;
  $('heur-sel').innerHTML = fams.map(f => `<optgroup label="${esc(f.title)}">` + f.members.map(id => `<option value="${id}">${esc(H[id].label)}</option>`).join('') + '</optgroup>').join('');
  function heurCard() {
    const h = H[$('heur-sel').value];
    $('heur-card').innerHTML = `<h4>${esc(h.title)} — ${esc(h.tagline)}</h4><ol>${h.how.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` + (h.impl && h.impl.length ? `<p class="small muted" style="margin:4px 0 0">${h.impl.map(esc).join(' ')}</p>` : '') + `<p class="small" style="margin:6px 0 0"><a href="learn.html#h-${h.id}">More on the Learn page</a></p>`;
  }

  // ---------- 3. local search
  const DRV = Object.keys(catalog.drivers).filter(k => k !== 'none' || true);
  const DRV_ORDER = ['none', 'first', 'vnd', 'rvnd', 'best'], DRV_LABEL = { none: 'None (the heuristic uses only its own moves)', first: 'First improvement', vnd: 'VND — variable neighbourhood descent', rvnd: 'RVND — randomised VND', best: 'Best improvement over all operators' };
  $('ls-sel').innerHTML = DRV_ORDER.map(k => `<option value="${k}">${esc(DRV_LABEL[k])}</option>`).join('');
  $('preset-sel').innerHTML = catalog.presets.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('') + '<option value="__custom">Custom list</option>';
  $('op-add').innerHTML = '<option value="">choose…</option>' + catalog.operator_groups.map(g => `<optgroup label="${esc(g.title)}">` + catalog.operators.filter(o => o.group === g.id).map(o => `<option value="${o.id}">${esc(o.title)}</option>`).join('') + '</optgroup>').join('');
  function lsCard() {
    const d = catalog.drivers[$('ls-sel').value]; $('ls-card').innerHTML = `<h4>${esc(d.title)}</h4><p style="margin:2px 0 6px">${esc(d.text)}</p><ol>${d.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
  }
  function renderOps() {
    const ls = $('ls-sel').value, none = ls === 'none'; $('ops-box').hidden = none; $('preset-box').hidden = none;
    $('ops-chips').innerHTML = state.ops.map((id, i) => `<span class="chip"><span class="idx">${i + 1}</span>${esc(OP[id].title)}<button type="button" data-a="up" data-i="${i}" title="move earlier">↑</button><button type="button" data-a="dn" data-i="${i}" title="move later">↓</button><button type="button" data-a="rm" data-i="${i}" title="remove">×</button></span>`).join('') || '<span class="muted small">No operator chosen.</span>';
    const same = catalog.presets.find(p => p.operators.length === state.ops.length && p.operators.every((o, i) => o === state.ops[i])); $('preset-sel').value = same ? same.id : '__custom';
    document.querySelectorAll('#op-add option').forEach(o => { if (o.value) o.disabled = (ls === 'first' && !OP[o.value].first_ok) || state.ops.includes(o.value); });
    const bad = ls === 'first' ? state.ops.filter(o => !OP[o.id || o].first_ok) : [];
    $('ops-note').textContent = ls === 'first' ? 'First improvement is available for the five operators of the Base-5 set only.' : (ls === 'rvnd' ? 'RVND draws the operator order at random at every pass; the list below is then the set, not the order.' : '');
    updateEst();
  }
  $('ops-chips').onclick = e => {
    const b = e.target.closest('button'); if (!b) return; const i = +b.dataset.i, a = b.dataset.a;
    if (a === 'rm') state.ops.splice(i, 1); else if (a === 'up' && i > 0) [state.ops[i - 1], state.ops[i]] = [state.ops[i], state.ops[i - 1]]; else if (a === 'dn' && i < state.ops.length - 1) [state.ops[i + 1], state.ops[i]] = [state.ops[i], state.ops[i + 1]]; renderOps();
  };
  $('op-add').onchange = () => { const v = $('op-add').value; if (v && !state.ops.includes(v)) state.ops.push(v); $('op-add').value = ''; renderOps(); };
  $('op-clear').onclick = () => { state.ops = []; renderOps(); };
  $('preset-sel').onchange = () => { const v = $('preset-sel').value; if (v !== '__custom') state.ops = PRESET[v].operators.slice(); renderOps(); };
  $('ls-sel').onchange = () => { const ls = $('ls-sel').value; if (ls === 'first') { state.ops = state.ops.filter(o => OP[o].first_ok); if (!state.ops.length) state.ops = PRESET.baseline_route.operators.slice(); } else if (ls !== 'none' && !state.ops.length) state.ops = PRESET.common5.operators.slice(); lsCard(); renderOps(); };

  // ---------- advanced parameters
  const paramVals = {};
  function renderParams() {
    const h = H[$('heur-sel').value], ids = [].concat(h.groups.own, h.groups.common, h.groups.layer).filter(k => catalog.params[k]);
    const uniq = [...new Set(ids)];
    $('params').innerHTML = uniq.map(k => {
      const p = catalog.params[k], v = k in paramVals ? paramVals[k] : p.default; const dis = (catalog.inactive_in_fixed_time || []).includes(k);
      const input = p.choices ? `<select data-k="${k}">${p.choices.map(c => `<option${c === v ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>` : p.type === 'bool' ? `<input type="checkbox" data-k="${k}"${v ? ' checked' : ''}>` : `<input type="number" data-k="${k}" value="${v}" step="${p.type === 'int' ? 1 : 'any'}">`;
      return `<div class="p"><label>${esc(p.label)}${dis ? ' <span class="pill">no effect with a time limit</span>' : ''}</label>${input}<div class="hint">${esc(p.plain_help || '')}</div></div>`;
    }).join('');
  }
  $('params').onchange = e => {
    const el = e.target, k = el.dataset.k; if (!k) return; const p = catalog.params[k];
    paramVals[k] = el.type === 'checkbox' ? el.checked : (p.type === 'int' ? parseInt(el.value, 10) : p.type === 'float' ? parseFloat(el.value) : el.value);
  };
  $('heur-sel').onchange = () => {
    const h = H[$('heur-sel').value]; heurCard(); renderParams();
    $('ls-sel').value = h.default_ls; state.ops = h.default_ls === 'none' ? [] : PRESET[h.default_nb] ? PRESET[h.default_nb].operators.slice() : []; lsCard(); renderOps();
  };

  // ---------- 4. run
  const hc = navigator.hardwareConcurrency || 2; $('nwork').max = Math.max(1, hc); $('nwork').value = Math.max(1, Math.min(4, hc - 1));
  function readRun() {
    const seeds = parseInt($('nseeds').value, 10), seed0 = parseInt($('seed0').value, 10), T = parseFloat($('tlim').value), w = parseInt($('nwork').value, 10);
    return { seeds, seed0, T, w };
  }
  function updateEst() {
    const r = readRun(); if (!(r.seeds >= 1 && r.T > 0 && r.w >= 1)) { $('est').textContent = '–'; return; }
    const w = Math.min(r.w, r.seeds), waves = Math.ceil(r.seeds / w), wall = waves * (r.T + 1), core = r.seeds * (r.T + 1); const fmt = s => s < 90 ? Math.round(s) + ' s' : s < 5400 ? (s / 60).toFixed(1) + ' min' : (s / 3600).toFixed(1) + ' h';
    $('est').textContent = fmt(wall); $('est-note').textContent = `(${r.seeds} runs on ${w} worker${w > 1 ? 's' : ''}, ${fmt(core)} of processor time)`;
  }
  ['seed0', 'nseeds', 'tlim', 'nwork'].forEach(id => $(id).oninput = updateEst);
  $('q-quick').onclick = () => { $('nseeds').value = 3; $('tlim').value = 5; updateEst(); }; $('q-short').onclick = () => { $('nseeds').value = 5; $('tlim').value = 30; updateEst(); };

  function buildSpec() {
    const r = readRun(), ls = $('ls-sel').value, hid = $('heur-sel').value, h = H[hid]; const err = [];
    if (!state.inst) err.push('Choose an instance first.');
    if (!(r.seeds >= 1 && r.seeds <= catalog.limits.max_runs)) err.push(`The number of seeds must be between 1 and ${catalog.limits.max_runs}.`);
    if (!(r.seed0 >= 0)) err.push('The first seed must be a whole number, 0 or more.');
    if (!(r.T > 0 && r.T <= 3600)) err.push('The time limit must be between 0 and 3600 seconds.');
    if (!(r.w >= 1 && r.w <= 32)) err.push('Parallel workers must be between 1 and 32.');
    if (ls !== 'none' && !state.ops.length) err.push('Choose at least one local-search operator, or set the move selection to “None”.');
    if (ls === 'first' && state.ops.some(o => !OP[o].first_ok)) err.push('First improvement works with the Base-5 operators only. Remove the others or choose another move selection.');
    if (err.length) throw new Error(err.join(' '));
    const same = catalog.presets.find(p => p.operators.length === state.ops.length && p.operators.every((o, i) => o === state.ops[i]));
    const nb = ls === 'none' ? 'none' : (same ? same.id : Engine.aliasName(state.ops));
    const own = {}; const ids = new Set([].concat(h.groups.own, h.groups.common, h.groups.layer)); for (const k of Object.keys(paramVals)) if (ids.has(k) && paramVals[k] !== catalog.params[k].default && paramVals[k] !== undefined && !(typeof paramVals[k] === 'number' && isNaN(paramVals[k]))) own[k] = paramVals[k];
    const T = r.T, ck = [T / 4, T / 2, 3 * T / 4, T].map(Engine.fmtG).join(':');
    const seeds = Array.from({ length: r.seeds }, (_, i) => r.seed0 + i);
    return { instance: state.inst.id, fam: state.inst.family, file: state.inst.file, custom: state.custom, heuristic: hid, local_search: ls, neighborhoods: nb, operators: ls === 'none' ? [] : state.ops.slice(), time_limit: T, checkpoints: ck, params: own, seeds, workers: Math.min(r.w, r.seeds) };
  }
  function setRunning(on) { $('run').disabled = on; $('cancel').disabled = !on; ['inst-sel', 'heur-sel', 'ls-sel', 'preset-sel', 'op-add', 'seed0', 'nseeds', 'tlim', 'nwork'].forEach(id => $(id).disabled = on); }
  // Anonymous usage count (GoatCounter): only the event name is sent, never instances, settings or results.
  function track(name) { try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, title: name, event: true }); } catch (e) { /* counting is optional */ } }

  $('run').onclick = async () => {
    $('run-err').textContent = ''; let spec; try { spec = buildSpec(); } catch (e) { $('run-err').textContent = e.message; return; }
    const wall = Math.ceil(spec.seeds.length / spec.workers) * (spec.time_limit + 1);
    if (wall > 120 && !confirm(`This run will take about ${(wall / 60).toFixed(1)} minutes and keep ${spec.workers} processor core(s) busy. Keep this tab open and in front. Start?`)) return;
    track('solve-clrp');
    state.results = []; state.runSpec = spec; renderResults(); setRunning(true); $('bar').hidden = false; $('bar').firstElementChild.style.width = '0%'; $('status').textContent = 'Starting the engine…';
    const ctx = { catalog, instBytes: state.bytes, refRecord: state.inst.bks ? { problem: 'CLRP', family: state.inst.family, instance_id: state.inst.id, reference_best: state.inst.bks, status: state.inst.status } : null };
    let done = 0; const t0 = performance.now();
    try {
      const h = await Engine.runSeeds(spec, ctx, r => { done++; state.results.push(r); $('bar').firstElementChild.style.width = (100 * done / spec.seeds.length) + '%'; $('status').textContent = `${done} of ${spec.seeds.length} runs finished`; renderResults(); }, () => { $('status').textContent = `Running ${spec.seeds.length} run(s)…`; });
      state.running = h; await h.done;
      state.wall = (performance.now() - t0) / 1000; $('status').textContent = `Finished in ${state.wall.toFixed(1)} s`;
    } catch (e) { $('run-err').textContent = 'The run stopped: ' + (e.message || e); }
    state.running = null; setRunning(false); renderResults();
  };
  $('cancel').onclick = () => { if (state.running) { state.running.cancel(); $('status').textContent = 'Cancelled.'; } };

  // ---------- 5. results
  function stats(a) { const n = a.length, m = a.reduce((x, y) => x + y, 0) / n, sd = n > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (n - 1)) : 0; return { n, m, sd, min: Math.min(...a), max: Math.max(...a) }; }
  function renderResults() {
    const R = state.results.slice().sort((a, b) => a.seed - b.seed); $('res-empty').hidden = R.length > 0; $('res').hidden = R.length === 0; if (!R.length) return;
    const ok = R.filter(r => r.status === 'ok' || (r.objective !== undefined && isFinite(r.objective))); const bks = state.inst && state.inst.bks;
    let best = null; for (const r of ok) if (!best || r.objective < best.objective) best = r;
    if (ok.length) { const c = stats(ok.map(r => r.objective)), s = `${ok.length} of ${R.length} runs · best ${num(c.min, 2)} · mean ${num(c.m, 2)} · std ${num(c.sd, 2)} · worst ${num(c.max, 2)}` + (bks ? ` · best gap ${num(100 * (c.min - bks) / bks, 2)}% · mean gap ${num(100 * (c.m - bks) / bks, 2)}% · runs at or below BKS: ${ok.filter(r => r.objective <= bks + 1e-6).length}` : ''); $('res-sum').textContent = s; } else $('res-sum').textContent = 'No run has finished successfully yet.';
    Charts.gapChart($('gap-chart'), bks ? ok : [], bks); $('gap-chart').previousElementSibling.hidden = !bks; $('gap-chart').hidden = !bks;
    const rs = $('route-seed'), cur = rs.value; rs.innerHTML = ok.map(r => `<option value="${r.seed}">seed ${r.seed}${r === best ? ' (best)' : ''}</option>`).join(''); rs.value = ok.some(r => String(r.seed) === cur) ? cur : (best ? String(best.seed) : '');
    drawRoutes();
    Charts.convergence($('conv-chart'), ok, bks, state.runSpec ? state.runSpec.time_limit : 0);
    const f = (v, d = 2) => v === undefined || v === null || !isFinite(v) ? '–' : num(v, d); const tb = document.querySelector('#res-table tbody');
    tb.innerHTML = R.map(r => { const c = r.components || {}; const st = r.status === 'ok' ? '<span class="ok">ok</span>' : r.status === 'error' ? `<span class="err" title="${esc(r.error || '')}">error</span>` : esc(r.status || ''); return `<tr class="${r === best ? 'best' : ''}"><td>${r.seed}</td><td>${f(r.objective)}</td><td>${f(c.opening)}</td><td>${f(c.vehicle)}</td><td>${f(c.routing)}</td><td>${r.gap === undefined || r.gap === null ? '–' : f(r.gap) + '%'}</td><td>${f(r.tbest, 2)} s</td><td>${f(r.wall_s, 1)} s</td><td>${st}</td></tr>`; }).join('');
    const firstErr = R.find(r => r.status === 'error'); if (firstErr) $('run-err').textContent = `Run ${firstErr.seed} failed: ${firstErr.error}`;
  }
  function drawRoutes() {
    const seed = +$('route-seed').value, r = state.results.find(x => x.seed === seed); if (!r || !r.solution) { $('route-chart').innerHTML = ''; $('route-info').textContent = ''; return; }
    const s = r.solution, c = s.objective_components || {}; $('route-info').textContent = `cost ${num(s.objective, 2)} = opening ${num(c.opening, 2)} + vehicles ${num(c.vehicle, 2)} + routing ${num(c.routing, 2)} · ${s.open_depots.length} open depot(s) · ${s.routes.length} route(s)`;
    Charts.routes($('route-chart'), state.inst, s);
  }
  $('route-seed').onchange = drawRoutes;

  // ---------- downloads
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const tag = () => `${state.runSpec.instance}_${state.runSpec.heuristic}_${state.runSpec.local_search}`;
  $('dl-csv').onclick = () => {
    if (!state.runSpec) return; const R = state.results.slice().sort((a, b) => a.seed - b.seed); const q = v => v === undefined || v === null ? '' : String(v);
    const rows = [['instance', 'heuristic', 'local_search', 'neighborhoods', 'time_limit_s', 'seed', 'status', 'cost', 'opening', 'vehicle', 'routing', 'gap_pct', 'time_to_best_s', 'wall_s', 'open_depots', 'routes']];
    for (const r of R) { const c = r.components || {}, s = r.solution; rows.push([state.runSpec.instance, state.runSpec.heuristic, state.runSpec.local_search, state.runSpec.neighborhoods, state.runSpec.time_limit, r.seed, r.status, r.objective, c.opening, c.vehicle, c.routing, r.gap, r.tbest, r.wall_s !== undefined ? r.wall_s.toFixed(2) : '', s ? s.open_depots.length : '', s ? s.routes.length : '']); }
    download(`clrp_${tag()}_${stamp()}.csv`, rows.map(r => r.map(q).join(',')).join('\n') + '\n', 'text/csv');
  };
  $('dl-log').onclick = () => { if (!state.runSpec) return; const R = state.results.slice().sort((a, b) => a.seed - b.seed); download(`clrp_${tag()}_${stamp()}.log`, R.map(r => `==== seed ${r.seed} · status ${r.status} · wall ${r.wall_s ? r.wall_s.toFixed(2) : '?'} s ====\n${r.sol_txt || ''}\n${r.log || ''}\n`).join('\n')); };
  $('dl-sol').onclick = () => { const ok = state.results.filter(r => r.solution); if (!ok.length) return; const b = ok.reduce((a, c) => a.objective <= c.objective ? a : c); download(`clrp_${tag()}_best_seed${b.seed}.json`, JSON.stringify(b.solution, null, 1), 'application/json'); };
  $('dl-cfg').onclick = () => {
    if (!state.runSpec) return; const sp = state.runSpec;
    download(`clrp_${tag()}_settings.json`, JSON.stringify({ site: 'CLRP Solver', engine: catalog.engine || '', created_utc: new Date().toISOString(), spec: { instance: sp.instance, heuristic: sp.heuristic, local_search: sp.local_search, neighborhoods: sp.neighborhoods, operators: sp.operators, time_limit_s: sp.time_limit, checkpoints: sp.checkpoints, params: sp.params, seeds: sp.seeds }, engine_arguments: sp.seeds.map(s => Engine.buildArgs(sp, s, catalog)), note: 'With a time limit the number of iterations depends on the speed of the device.' }, null, 1), 'application/json');
  };

  // ---------- start
  $('foot').textContent = 'CLRP Solver — engine ' + (catalog.engine || '') + (catalog.kit_version ? ' · data release ' + catalog.kit_version : '');
  $('heur-sel').value = 'ils'; heurCard(); renderParams(); lsCard(); $('ls-sel').value = 'rvnd'; state.ops = PRESET.common5.operators.slice(); lsCard(); renderOps();
  // ---------- quick start / expert. Quick start hides steps 2 and 3 and runs one fixed, documented setting.
  const QUICK = { heuristic: 'ils', ls: 'rvnd', preset: 'common5', seeds: 3, tlim: 5 };   // provisional choice (the page default); to be confirmed by the benchmark runs
  const setMode = (m, keep) => {
    const quick = m === 'quick'; document.body.classList.toggle('quick', quick);
    $('mode-quick').setAttribute('aria-pressed', quick); $('mode-expert').setAttribute('aria-pressed', !quick);
    $('run-num').textContent = quick ? '2' : '4'; $('quick-card').hidden = !quick;
    $('mode-note').textContent = quick ? 'One recommended setting. Switch to Expert to choose the heuristic, the operators and the parameters.' : 'All 18 heuristics, 5 move-selection rules and 18 operators.';
    if (quick) {
      $('heur-sel').value = QUICK.heuristic; $('heur-sel').onchange(); $('ls-sel').value = QUICK.ls; state.ops = PRESET[QUICK.preset].operators.slice(); lsCard(); renderOps();
      $('seed0').value = 1; $('nseeds').value = QUICK.seeds; $('tlim').value = QUICK.tlim; updateEst();
      $('quick-card').innerHTML = `<strong>Recommended setting.</strong> ${H[QUICK.heuristic].label} with ${$('ls-sel').selectedOptions[0].textContent} over ${state.ops.length} operators, ${QUICK.seeds} seeds × ${QUICK.tlim} s. <a href="learn.html#h-${QUICK.heuristic}">How it works</a>`;
    }
    if (!keep) { try { localStorage.setItem('clrp-mode', m); } catch (e) { /* storage not available */ } }
  };
  $('mode-quick').onclick = () => setMode('quick'); $('mode-expert').onclick = () => setMode('expert');
  { const q = new URLSearchParams(location.search).get('h'); let m = 'quick'; try { m = localStorage.getItem('clrp-mode') || 'quick'; } catch (e) { /* storage not available */ }
    if (q && H[q]) { setMode('expert', true); $('heur-sel').value = q; $('heur-sel').onchange(); } else setMode(m === 'expert' ? 'expert' : 'quick', true); }  // ?h=… is the link from the Learn page
  await loadBuiltin('coord20-5-1'); $('inst-sel').value = 'coord20-5-1'; updateEst();
  window.CLRP = { state, buildSpec, catalog, manifest };
})();
