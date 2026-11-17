/* learn.js -- builds the Learn page from the data files (so text, operator pictures and references cannot drift apart). */
(async function () {
  const $ = id => document.getElementById(id), esc = Charts.esc;
  const [cat, man, lit, map, ex] = await Promise.all(['catalog', 'instances', 'literature', 'learn_map', 'example_solution'].map(n => fetch(`data/${n}.json`).then(r => r.json())));
  const H = Object.fromEntries(cat.heuristics.map(h => [h.id, h])), L = Object.fromEntries(lit.map(x => [x.key, x])), OP = Object.fromEntries(cat.operators.map(o => [o.id, o]));
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const INIT = /^(?:[A-ZÉ]\.(?:-[A-Z]\.)?\s?)+$/, fam = a => { if (/ et al\.$/.test(a)) return a.split(',')[0] + ' et al.'; const n = a.split(', ').filter(t => !INIT.test(t.trim())); return n.length === 1 ? n[0] : n.length === 2 ? `${n[0]} and ${n[1]}` : `${n[0]} et al.`; };
  const grp = {}; lit.forEach(x => { const k = fam(x.a) + x.y; (grp[k] = grp[k] || []).push(x.key); });
  const sfx = k => { const g = grp[fam(L[k].a) + L[k].y]; return g.length > 1 ? 'abcdefgh'[g.indexOf(k)] : ''; };   // 2006a / 2006b for the same author group and year
  const short = k => { const x = L[k]; return x ? `${fam(x.a)} (${x.y}${sfx(k)})` : k; };
  const cite = k => `<a href="#ref-${k}">${esc(short(k))}${L[k] && !L[k].read ? '†' : ''}</a>`;
  document.querySelectorAll('[data-ref]').forEach(s => { s.innerHTML = cite(s.dataset.ref); });
  $('foot').textContent = 'CLRP Solver — engine ' + (cat.engine || '') + (cat.kit_version ? ' · data release ' + cat.kit_version : '');

  // ---- problem figure
  const inst = man.find(o => o.id === ex.instance); Charts.routes($('fig-problem'), inst, ex);

  // ---- data table
  const G = [['P', 'P set (Prodhon)', 'prins06a', 'Prins et al. 2006'], ['B', 'B set (Barreto)', 'barreto07', 'Barreto et al. 2007'], ['T', 'T set (Tüzün and Burke)', 'tuzun99', '']];
  $('data-table').innerHTML = '<div style="overflow-x:auto"><table class="res"><thead><tr><th>Set</th><th>Instances</th><th>Customers</th><th>Depots</th><th>With a best known value</th><th>Distances</th><th>Source</th></tr></thead><tbody>' + G.map(([f, name, key]) => {
    const a = man.filter(o => o.family === f), r = v => { const lo = Math.min(...v), hi = Math.max(...v); return lo === hi ? lo : `${lo}–${hi}`; };
    return `<tr><td>${esc(name)}</td><td>${a.length}</td><td>${r(a.map(o => o.n))}</td><td>${r(a.map(o => o.m))}</td><td>${a.filter(o => o.bks).length}</td><td>${f === 'P' ? '100 × Euclid, rounded up' : 'real Euclid'}</td><td>${cite(key)}</td></tr>`;
  }).join('') + '</tbody></table></div><p class="hint">Instance sizes: P 20–200 customers with 5 or 10 depots; B 27–150 customers; T 100–200 customers with 10 depots. B-set data come from adapted classical test data; see the paper cited above.</p>';

  // ---- animations
  function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
  const W = 400, Hh = 170;
  const svgOpen = `<svg viewBox="0 0 ${W} ${Hh}" role="img">`;
  const anims = {};
  anims.restart = (el) => {                                   // cost against time: descents, restarts, best-so-far staircase
    const R = rng(7), pts = []; let best = 1e9, bestPts = [], t = 0; const K = 6;
    for (let k = 0; k < K; k++) { const start = 130 - R() * 30, end = 62 + R() * 30 - k * 3; for (let i = 0; i <= 14; i++) { const v = end + (start - end) * Math.exp(-i / 3.2); pts.push([t++, v]); if (v < best) best = v; bestPts.push([t - 1, best]); } }
    const sx = x => 12 + x * (W - 24) / (t - 1), sy = y => Hh - 12 - (y - 40) * (Hh - 30) / 100;
    el.innerHTML = svgOpen + '<polyline class="a" fill="none" stroke="var(--accent)" stroke-width="2"/><polyline class="b" fill="none" stroke="var(--ok)" stroke-width="1.6" stroke-dasharray="4 3"/><text x="14" y="14">cost</text><text x="' + (W - 60) + '" y="' + (Hh - 2) + '">time</text><text x="14" y="' + (Hh - 2) + '">restart · improve · shake</text></svg>';
    const a = el.querySelector('.a'), b = el.querySelector('.b');
    return f => { const n = Math.max(2, Math.floor(f * pts.length)); a.setAttribute('points', pts.slice(0, n).map(p => sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1)).join(' ')); b.setAttribute('points', bestPts.slice(0, n).map(p => sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1)).join(' ')); };
  };
  anims.walk = (el) => {                                      // a walk that accepts worse moves early and fewer later
    const R = rng(11), pts = [], best = []; let v = 120, b = v; const N = 90;
    for (let i = 0; i < N; i++) { const T = 1 - i / N, d = (R() - 0.55) * 26 * (0.15 + T); const nv = v + d; if (nv < v || R() < Math.exp(-(nv - v) / (14 * T + 0.5))) v = nv; v = Math.max(45, Math.min(150, v)); b = Math.min(b, v); pts.push([i, v]); best.push([i, b]); }
    const sx = x => 12 + x * (W - 24) / (N - 1), sy = y => Hh - 12 - (y - 40) * (Hh - 30) / 120;
    el.innerHTML = svgOpen + '<polyline class="a" fill="none" stroke="var(--accent)" stroke-width="1.6"/><polyline class="b" fill="none" stroke="var(--ok)" stroke-width="1.6" stroke-dasharray="4 3"/><text x="14" y="14">cost</text><text x="14" y="' + (Hh - 2) + '">worse moves are accepted less and less often</text></svg>';
    const a = el.querySelector('.a'), bb = el.querySelector('.b');
    return f => { const n = Math.max(2, Math.floor(f * N)); a.setAttribute('points', pts.slice(0, n).map(p => sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1)).join(' ')); bb.setAttribute('points', best.slice(0, n).map(p => sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1)).join(' ')); };
  };
  anims.repair = (el) => {                                    // a route, parts removed, parts put back
    const R = rng(5), C = Array.from({ length: 12 }, (_, i) => [70 + i * 22 + (R() - .5) * 10, 60 + 38 * Math.sin(i * 0.9) + (R() - .5) * 14]), gone = [2, 3, 6, 8, 9];
    const D = [30, 110]; el.innerHTML = svgOpen + '<g class="l"></g><g class="d"></g><text x="14" y="14" class="t"></text></svg>'; const g = el.querySelector('.l'), d = el.querySelector('.d'), t = el.querySelector('.t');
    return f => {
      const ph = f < .33 ? 0 : f < .66 ? 1 : 2, k = ph === 0 ? 0 : ph === 1 ? Math.min(gone.length, Math.ceil(((f - .33) / .33) * gone.length)) : gone.length - Math.min(gone.length, Math.ceil(((f - .66) / .34) * gone.length));
      const out = new Set(gone.slice(0, k)); t.textContent = ph === 0 ? 'a solution' : ph === 1 ? 'destroy: remove customers' : 'repair: put them back at the cheapest place';
      const seq = C.map((c, i) => i).filter(i => !out.has(i)); g.innerHTML = `<polyline fill="none" stroke="var(--accent)" stroke-width="1.6" points="${[D].concat(seq.map(i => C[i])).concat([D]).map(p => p[0].toFixed(0) + ',' + p[1].toFixed(0)).join(' ')}"/>`;
      d.innerHTML = `<rect x="${D[0] - 6}" y="${D[1] - 6}" width="12" height="12" fill="var(--depot)"/>` + C.map((c, i) => `<circle cx="${c[0].toFixed(0)}" cy="${c[1].toFixed(0)}" r="5" fill="${out.has(i) ? 'none' : 'var(--accent)'}" stroke="${out.has(i) ? 'var(--muted)' : 'var(--accent)'}" stroke-dasharray="${out.has(i) ? '2 2' : ''}"/>`).join('');
    };
  };
  anims.population = (el) => {                                // dots = solutions; two parents are combined into a child
    const R = rng(3), P = Array.from({ length: 8 }, () => [40 + R() * 320, 30 + R() * 110]); el.innerHTML = svgOpen + '<g class="d"></g><text x="14" y="14" class="t"></text></svg>'; const d = el.querySelector('.d'), t = el.querySelector('.t');
    return f => {
      const round = Math.floor(f * 3), ff = (f * 3) % 1, a = (round * 3) % 8, b = (round * 3 + 4) % 8, ch = [(P[a][0] + P[b][0]) / 2 + 12, (P[a][1] + P[b][1]) / 2 - 14];
      t.textContent = ff < .33 ? 'choose two parents' : ff < .66 ? 'combine them into a child' : 'the child may replace a worse solution';
      d.innerHTML = P.map((p, i) => `<circle cx="${p[0].toFixed(0)}" cy="${p[1].toFixed(0)}" r="${i === a || i === b ? 8 : 6}" fill="${i === a || i === b ? 'var(--accent)' : 'var(--muted)'}" fill-opacity=".8"/>`).join('') + (ff >= .33 ? `<line x1="${P[a][0]}" y1="${P[a][1]}" x2="${ch[0]}" y2="${ch[1]}" stroke="var(--accent)"/><line x1="${P[b][0]}" y1="${P[b][1]}" x2="${ch[0]}" y2="${ch[1]}" stroke="var(--accent)"/><circle cx="${ch[0]}" cy="${ch[1]}" r="7" fill="var(--ok)"/>` : '');
    };
  };
  anims.randomkey = (el) => {                                 // a vector of random numbers is decoded into an order of customers
    el.innerHTML = svgOpen + '<g class="d"></g><text x="14" y="14" class="t"></text></svg>'; const d = el.querySelector('.d'), t = el.querySelector('.t'), pos = [[200, 130], [90, 100], [130, 60], [230, 55], [300, 90], [260, 130]];
    return f => {
      const g = Math.floor(f * 3), R = rng(40 + g), keys = Array.from({ length: 6 }, () => R()), ord = keys.map((k, i) => [k, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]), ff = (f * 3) % 1;
      t.textContent = ff < .4 ? 'a random-key vector' : 'sort the keys: this is the visiting order of the customers';
      d.innerHTML = keys.map((k, i) => `<rect x="${20 + i * 22}" y="${40 - k * 22}" width="16" height="${k * 22}" fill="var(--accent)" fill-opacity=".75"/><text x="${24 + i * 22}" y="54">${i + 1}</text>`).join('') +
        (ff >= .4 ? `<polyline fill="none" stroke="var(--ok)" stroke-width="1.6" points="${ord.map(i => pos[i].join(',')).join(' ')}"/>` : '') + pos.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="9" fill="var(--card)" stroke="var(--accent)"/><text x="${p[0] - 3}" y="${p[1] + 4}">${i + 1}</text>`).join('');
    };
  };
  const players = [];
  function play(fn, dur) { let t0 = null; const draw = ts => { if (t0 === null) t0 = ts; fn(((ts - t0) % dur) / dur); if (!reduce) requestAnimationFrame(draw); }; if (reduce) fn(0.98); else requestAnimationFrame(draw); }
  const vis = new IntersectionObserver(es => es.forEach(e => { e.target._on = e.isIntersecting; }), {});

  // ---- families
  $('families').innerHTML = cat.families.map(f => {
    const members = f.members.map(id => H[id]);
    return `<h3 id="f-${f.id}">${esc(f.title)}</h3><p>${esc(f.blurb)}</p><div class="row" style="align-items:flex-start"><div class="anim" style="flex:0 0 min(100%,420px)" id="anim-${f.id}"></div></div>
      <div class="fam">${members.map(h => `<div class="fcard" id="h-${h.id}"><h4>${esc(h.title)}</h4><div class="tag">${esc(h.tagline)}</div><ol>${h.how.map(s => `<li>${esc(s)}</li>`).join('')}</ol>${h.impl && h.impl.length ? `<p class="small muted" style="margin:4px 0">${h.impl.map(esc).join(' ')}</p>` : ''}
      <div class="refs">Method: ${(map.map.heur[h.id].m || []).map(cite).join('; ') || '–'}${(map.map.heur[h.id].c || []).length ? `<br>Applied to the CLRP or close variants: ${map.map.heur[h.id].c.map(cite).join('; ')}` : ''}</div>
      <p class="small" style="margin:8px 0 0"><a href="index.html?h=${h.id}">Try it in the Solver</a></p></div>`).join('')}</div>`;
  }).join('');
  for (const f of cat.families) {
    const key = { restart: 'restart', walk: 'walk', repair: 'repair', population: 'population', randomkey: 'randomkey' }[f.id], host = $('anim-' + f.id); if (!anims[key]) continue; const fn = anims[key](host);
    let t0 = null; vis.observe(host); host._on = true; const dur = f.id === 'restart' ? 9000 : 8000;
    const draw = ts => { if (t0 === null) t0 = ts; if (host._on) fn(((ts - t0) % dur) / dur); requestAnimationFrame(draw); }; if (reduce) fn(0.98); else requestAnimationFrame(draw);
  }

  // ---- local-search driver animation
  const DR = ['none', 'first', 'vnd', 'rvnd', 'best'], DRL = { none: 'None', first: 'First improvement', vnd: 'VND', rvnd: 'RVND', best: 'Best improvement over all operators' };
  $('drv-sel').innerHTML = DR.map(k => `<option value="${k}">${DRL[k]}</option>`).join(''); $('drv-sel').value = 'vnd';
  const names = ['Move one stop', 'Reverse a stretch', 'Move to another route', 'Swap between routes', 'Route to another depot'];
  let S;
  function reset() {
    const R = rng(21); S = { drv: $('drv-sel').value, cost: 1000, order: [0, 1, 2, 3, 4], pos: 0, cap: [3, 2, 3, 2, 1], R, log: [], pool: [0, 1, 2, 3, 4], fails: 0, done: false, hl: -1, last: '' };
    if (S.drv === 'rvnd') { S.pool = shuffle([0, 1, 2, 3, 4]); } render();
  }
  function shuffle(a) { const r = S ? S.R : rng(1); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const found = i => S.cap[i] > 0 && S.R() < 0.7;
  function apply(i, gain) { S.cap[i]--; S.cost -= gain; S.last = `“${names[i]}” found an improving move (−${gain}). Cost is now ${S.cost}.`; }
  function step() {
    if (S.done) return; const d = S.drv;
    if (d === 'none') { S.last = 'No local search: the heuristic keeps its own solution.'; S.done = true; }
    else if (d === 'first' || d === 'vnd') {
      const i = S.order[S.pos]; S.hl = i;
      if (found(i)) { apply(i, 20 + Math.floor(S.R() * 40)); S.pos = 0; S.fails = 0; S.last += ' Go back to operator 1.'; }
      else { S.last = `“${names[i]}” finds nothing. Try the next operator.`; S.pos++; if (S.pos >= S.order.length) { S.done = true; S.last = 'No operator improves: local optimum reached.'; S.hl = -1; } }
    } else if (d === 'rvnd') {
      if (!S.pool.length) { S.done = true; S.last = 'The list is empty: local optimum reached.'; S.hl = -1; }
      else { const i = S.pool[0]; S.hl = i; if (found(i)) { apply(i, 20 + Math.floor(S.R() * 40)); S.pool = shuffle([0, 1, 2, 3, 4]); S.last += ' Refill and shuffle the list.'; } else { S.pool.shift(); S.last = `“${names[i]}” finds nothing and leaves the list.`; } }
    } else if (d === 'best') {
      const gains = [0, 1, 2, 3, 4].map(i => (S.cap[i] > 0 && S.R() < 0.8) ? 20 + Math.floor(S.R() * 40) : 0), m = Math.max(...gains), i = gains.indexOf(m); S.hl = -1;
      if (m > 0) { apply(i, m); S.last = `All operators scanned; the best move (“${names[i]}”, −${m}) is applied. Cost is now ${S.cost}.`; } else { S.done = true; S.last = 'No operator improves: local optimum reached.'; }
    }
    render();
  }
  function render() {
    const d = S.drv, list = d === 'rvnd' ? S.pool : S.order;
    $('drv-anim').innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">${(d === 'none' ? [] : list).map(i => `<div class="chip" style="padding:6px 12px;${S.hl === i ? 'background:var(--accent);color:var(--accent-ink)' : ''}">${esc(names[i])}</div>`).join('') || '<span class="muted small">no operators</span>'}</div><div><strong>Cost: ${S.cost}</strong> &nbsp; <span class="muted small">${esc(S.last || 'Press Play or Step.')}</span></div>`;
    const dd = cat.drivers[d]; $('drv-card').innerHTML = `<h4>${esc(dd.title)}</h4><p style="margin:2px 0 6px">${esc(dd.text)}</p><ol>${dd.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
  }
  let timer = null; const stop = () => { clearInterval(timer); timer = null; $('drv-play').textContent = 'Play'; };
  $('drv-play').onclick = () => { if (timer) return stop(); if (S.done) reset(); $('drv-play').textContent = 'Pause'; timer = setInterval(() => { step(); if (S.done) stop(); }, 900); };
  $('drv-step').onclick = () => { stop(); if (S.done) reset(); step(); }; $('drv-reset').onclick = () => { stop(); reset(); }; $('drv-sel').onchange = () => { stop(); reset(); };
  reset();

  // ---- operators
  function pic(p, which) {
    const names = Object.keys(p.customers), dn = Object.keys(p.depots), pts = Object.values(p.customers).concat(Object.values(p.depots).map(v => [v[0], v[1]]));
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), w = 180, h = 130, pad = 18, s = Math.min((w - 2 * pad) / Math.max(1, x1 - x0), (h - 2 * pad) / Math.max(1, y1 - y0));
    const X = x => pad + (x - x0) * s + ((w - 2 * pad) - (x1 - x0) * s) / 2, Y = y => pad + (y - y0) * s + ((h - 2 * pad) - (y1 - y0) * s) / 2, at = n => p.customers[n] || p.depots[n];
    const rts = p[which]; let o = `<svg viewBox="0 0 ${w} ${h}" role="img">`;
    rts.forEach(r => { const col = Charts.COLORS[r.color % Charts.COLORS.length], seq = [r.depot].concat(r.seq, [r.depot]); o += `<polyline fill="none" stroke="${col}" stroke-width="1.8" points="${seq.map(n => X(at(n)[0]).toFixed(1) + ',' + Y(at(n)[1]).toFixed(1)).join(' ')}"/>`; });
    names.forEach(n => { o += `<circle cx="${X(p.customers[n][0]).toFixed(1)}" cy="${Y(p.customers[n][1]).toFixed(1)}" r="4" fill="var(--card)" stroke="var(--ink)"/><text x="${(X(p.customers[n][0]) + 6).toFixed(1)}" y="${(Y(p.customers[n][1]) - 5).toFixed(1)}" style="font-size:9px">${esc(n)}</text>`; });
    dn.forEach(n => { const cl = (p.closed || []).includes(n), v = p.depots[n]; o += `<rect x="${(X(v[0]) - 6).toFixed(1)}" y="${(Y(v[1]) - 6).toFixed(1)}" width="12" height="12" fill="${cl ? 'var(--card)' : 'var(--depot)'}" stroke="var(--depot)" stroke-width="1.4"/><text x="${(X(v[0]) + 8).toFixed(1)}" y="${(Y(v[1]) + 4).toFixed(1)}" style="font-size:9px">${esc(n)}</text>`; });
    return o + '</svg>';
  }
  const pre = cat.presets; $('op-presets').innerHTML = '<div style="overflow-x:auto"><table class="lit"><thead><tr><th>Operator</th>' + pre.map(p => `<th>${esc(p.label)}</th>`).join('') + '</tr></thead><tbody>' + cat.operators.map(o => `<tr><td><a href="#op-${o.id}">${esc(o.title)}</a></td>${pre.map(p => `<td class="${p.operators.includes(o.id) ? 'y' : 'n'}">${p.operators.includes(o.id) ? '✓' : '·'}</td>`).join('')}</tr>`).join('') + '</tbody></table></div><p class="hint">The order of the operators inside a preset is the order of the Solver page. First improvement works with the Base-5 set only.</p>';
  $('ops').innerHTML = cat.operator_groups.map(g => `<h3>${esc(g.title)}</h3><p>${esc(g.blurb)}</p>` + cat.operators.filter(o => o.group === g.id).map(o => `<div class="opcard" id="op-${o.id}"><div><h4>${esc(o.title)}</h4><p style="margin:2px 0">${esc(o.short)}</p><p class="small" style="margin:6px 0">${esc(o.text)}</p><div class="why"><strong>Why it helps.</strong> ${esc(o.why)}</div>${o.watch ? `<div class="watch"><strong>Watch out.</strong> ${esc(o.watch)}</div>` : ''}<div class="small muted" style="margin-top:8px">Sources: ${(map.map.op[o.id] || []).map(cite).join('; ')}</div></div>
    <div class="ba"><div>${pic(o.picture, 'before')}<div class="cap">before: cost ${o.picture.cost_before}</div></div><div>${pic(o.picture, 'after')}<div class="cap">after: cost ${o.picture.cost_after}</div></div></div></div>`).join('')).join('');

  // ---- literature matrix
  const sym = { y: ['y', '✓'], p: ['p', '≈'], n: ['n', '·'] };
  $('matrix').innerHTML = '<table class="lit"><thead><tr><th>Operator</th>' + map.cols.map(([k, n]) => `<th><a href="#ref-${k}">${esc(n)}${L[k] && !L[k].read ? ' †' : ''}</a></th>`).join('') + '</tr></thead><tbody>' + cat.operators.map(o => `<tr><td><a href="#op-${o.id}">${esc(o.title)}</a></td>${map.matrix[o.id].map(c => `<td class="${sym[c][0]}">${sym[c][1]}</td>`).join('')}</tr>`).join('') + '</tbody></table>';

  // ---- references
  const GRP = [['survey', 'Problem and surveys'], ['exact', 'Exact methods'], ['heur', 'Heuristics and metaheuristics for the CLRP'], ['open', 'Open code and data'], ['bench', 'Benchmark instances'], ['related', 'Related problems and operators'], ['meta', 'Metaheuristic foundations'], ['ops', 'Local-search operators']];
  const fmt = x => `<li id="ref-${x.key}">${esc(x.a)} (${x.y}${sfx(x.key)}). ${esc(x.t)}. <em>${esc(x.v)}</em>.${x.doi ? ` <a href="https://doi.org/${x.doi}" rel="noopener">https://doi.org/${esc(x.doi)}</a>` : ''}${!x.ok && !x.doi ? ' <span class="muted">(not verified)</span>' : ''}${!x.read ? ' <span class="muted" title="not re-read for this site">†</span>' : ''}${x.n ? ` <span class="muted">${esc(x.n)}</span>` : ''}</li>`;
  $('refs').innerHTML = GRP.map(([g, t]) => { const a = lit.filter(x => x.g === g).sort((p, q) => p.a.localeCompare(q.a) || p.y - q.y); return a.length ? `<h3>${esc(t)}</h3><ol class="refs">${a.map(fmt).join('')}</ol>` : ''; }).join('') + '<p class="small muted">† not re-read for this site; the information comes from the survey articles and from our own notes.</p>';
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
})();
