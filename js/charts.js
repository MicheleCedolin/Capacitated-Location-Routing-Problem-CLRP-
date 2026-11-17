/* charts.js -- small dependency-free SVG charts for the CLRP site. */
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = ['var(--c0)', 'var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)', 'var(--c9)'];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, d = 0) => (v === null || v === undefined || !isFinite(v)) ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  function niceTicks(lo, hi, k = 5) {
    if (!(hi > lo)) { hi = lo + 1; }
    const raw = (hi - lo) / k, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag, step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
    const a = Math.floor(lo / step) * step, out = []; for (let v = a; v <= hi + step * 0.5; v += step) out.push(+v.toPrecision(12)); return out;
  }
  function bounds(inst, extra) {
    let xs = inst.dep.map(d => d[0]).concat(inst.cus.map(c => c[0])), ys = inst.dep.map(d => d[1]).concat(inst.cus.map(c => c[1]));
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); return { x0, x1, y0, y1 };
  }
  function plane(inst, W, H, pad) {
    const b = bounds(inst), sx = (W - 2 * pad) / Math.max(1e-9, b.x1 - b.x0), sy = (H - 2 * pad) / Math.max(1e-9, b.y1 - b.y0), s = Math.min(sx, sy);
    const ox = pad + ((W - 2 * pad) - s * (b.x1 - b.x0)) / 2, oy = pad + ((H - 2 * pad) - s * (b.y1 - b.y0)) / 2;
    return { X: x => ox + (x - b.x0) * s, Y: y => H - (oy + (y - b.y0) * s) };
  }
  // instance map: customers = dots (radius ~ demand), depots = squares
  function instanceMap(el, inst) {
    const W = 520, H = 380, P = 22, T = plane(inst, W, H, P); const dm = inst.cus.map(c => c[2]), dmax = Math.max(...dm), dmin = Math.min(...dm);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Instance map">`;
    for (const c of inst.cus) { const r = 2.6 + (dmax > dmin ? 2.6 * (c[2] - dmin) / (dmax - dmin) : 1); s += `<circle cx="${T.X(c[0]).toFixed(1)}" cy="${T.Y(c[1]).toFixed(1)}" r="${r.toFixed(1)}" fill="var(--c0)" fill-opacity=".7"><title>customer, demand ${c[2]}</title></circle>`; }
    inst.dep.forEach((d, k) => { s += `<rect x="${(T.X(d[0]) - 6).toFixed(1)}" y="${(T.Y(d[1]) - 6).toFixed(1)}" width="12" height="12" fill="var(--depot)"><title>depot ${k + 1}: capacity ${inst.dcap[k]}, opening cost ${inst.dopen[k]}</title></rect>`; });
    el.innerHTML = s + '</svg>';
  }
  // gap chart: one dot per seed, reference line at 0
  function gapChart(el, results, bks) {
    const ok = results.filter(r => r.gap !== undefined && r.gap !== null && isFinite(r.gap)); if (!ok.length) { el.innerHTML = ''; return; }
    const W = 760, H = 230, L = 56, R = 14, T = 14, B = 34; const g = ok.map(r => r.gap); let lo = Math.min(0, ...g), hi = Math.max(0, ...g); const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
    const ticks = niceTicks(lo, hi, 5); lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    const Y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo)), n = ok.length, X = i => L + (W - L - R) * (n === 1 ? 0.5 : (i + 0.5) / n);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gap to the best known solution per seed">`;
    for (const t of ticks) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${num(t, Math.abs(t) < 10 && t % 1 ? 1 : 0)}%</text>`;
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--ok)" stroke-width="1.6" stroke-dasharray="5 4"/><text x="${W - R}" y="${Y(0) - 5}" text-anchor="end" style="fill:var(--ok)">best known solution</text>`;
    ok.forEach((r, i) => { s += `<circle cx="${X(i)}" cy="${Y(r.gap)}" r="5" fill="${r.gap <= 1e-9 ? 'var(--ok)' : 'var(--accent)'}"><title>seed ${r.seed}: cost ${num(r.objective, 2)}, gap ${num(r.gap, 2)}%</title></circle><text x="${X(i)}" y="${H - 14}" text-anchor="middle">${r.seed}</text>`; });
    s += `<text x="${(L + W - R) / 2}" y="${H - 1}" text-anchor="middle">seed</text><text transform="translate(12 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">gap to best known (%)</text></svg>`;
    el.innerHTML = s;
  }
  // routes of one solution (0-based indices into inst.dep / inst.cus)
  function routes(el, inst, sol) {
    const W = 760, H = 460, P = 26, T = plane(inst, W, H, P); const open = new Set(sol.open_depots); let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Routes of the best run">`;
    sol.routes.forEach((r, i) => {
      const col = COLORS[i % COLORS.length], d = inst.dep[r.depot], pts = [d].concat(r.customers.map(c => inst.cus[c]), [d]);
      s += `<polyline points="${pts.map(p => T.X(p[0]).toFixed(1) + ',' + T.Y(p[1]).toFixed(1)).join(' ')}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round"><title>route ${i + 1}: depot ${r.depot + 1}, ${r.customers.length} customers, load ${num(r.load)}, cost ${num(r.cost, 2)}</title></polyline>`;
    });
    sol.routes.forEach((r, i) => { const col = COLORS[i % COLORS.length]; for (const c of r.customers) { const p = inst.cus[c]; s += `<circle cx="${T.X(p[0]).toFixed(1)}" cy="${T.Y(p[1]).toFixed(1)}" r="3.6" fill="${col}"><title>customer ${c + 1}, demand ${p[2]}</title></circle>`; } });
    inst.dep.forEach((d, k) => { const o = open.has(k); s += `<rect x="${(T.X(d[0]) - 7).toFixed(1)}" y="${(T.Y(d[1]) - 7).toFixed(1)}" width="14" height="14" fill="${o ? 'var(--depot)' : 'var(--card)'}" stroke="var(--depot)" stroke-width="1.6"><title>depot ${k + 1} (${o ? 'open' : 'closed'}): capacity ${inst.dcap[k]}, opening cost ${inst.dopen[k]}</title></rect>`; });
    el.innerHTML = s + '</svg>';
  }
  // convergence: best-so-far cost against time, one line per seed, best seed highlighted
  function convergence(el, results, bks, T_end) {
    const runs = results.filter(r => r.trajectory && r.trajectory.length); if (!runs.length) { el.innerHTML = '<p class="muted small">No incumbent was recorded.</p>'; return; }
    const W = 760, H = 270, L = 70, R = 14, Tp = 12, B = 34; let lo = Infinity, hi = -Infinity, tmax = T_end || 0;
    for (const r of runs) for (const p of r.trajectory) { const o = +p.objective; lo = Math.min(lo, o); hi = Math.max(hi, o); tmax = Math.max(tmax, +p.time_s); }
    if (bks) lo = Math.min(lo, bks); const span = hi - lo || 1; hi = Math.min(hi, lo + span * 1.0); lo -= span * 0.04;
    const ty = niceTicks(lo, hi, 5), tx = niceTicks(0, tmax, 6); const X = t => L + (W - L - R) * Math.min(1, t / (tmax || 1)), Y = v => Tp + (H - Tp - B) * (1 - (v - ty[0]) / (ty[ty.length - 1] - ty[0]));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Convergence of the best cost over time">`;
    for (const t of ty) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${num(t)}</text>`;
    for (const t of tx) if (t <= tmax * 1.001) s += `<line class="grid" x1="${X(t)}" x2="${X(t)}" y1="${Tp}" y2="${H - B}"/><text x="${X(t)}" y="${H - B + 14}" text-anchor="middle">${num(t, t % 1 ? 1 : 0)}</text>`;
    const best = runs.reduce((a, b) => (+a.objective <= +b.objective ? a : b));
    for (const r of runs) {
      let d = ''; let prev = null;
      for (const p of r.trajectory) { const x = X(+p.time_s), y = Y(+p.objective); d += (prev === null ? `M${x.toFixed(1)},${y.toFixed(1)}` : `H${x.toFixed(1)}V${y.toFixed(1)}`); prev = y; }
      d += `H${X(tmax).toFixed(1)}`; const isBest = r === best;
      s += `<path d="${d}" fill="none" stroke="${isBest ? 'var(--accent)' : 'var(--muted)'}" stroke-opacity="${isBest ? 1 : .45}" stroke-width="${isBest ? 2 : 1}"><title>seed ${r.seed}</title></path>`;
    }
    if (bks && Y(bks) >= Tp && Y(bks) <= H - B) s += `<line x1="${L}" x2="${W - R}" y1="${Y(bks)}" y2="${Y(bks)}" stroke="var(--ok)" stroke-width="1.4" stroke-dasharray="5 4"/><text x="${W - R}" y="${Y(bks) - 5}" text-anchor="end" style="fill:var(--ok)">best known</text>`;
    s += `<text x="${(L + W - R) / 2}" y="${H - 2}" text-anchor="middle">time (s)</text><text transform="translate(12 ${(Tp + H - B) / 2}) rotate(-90)" text-anchor="middle">best cost so far</text></svg>`;
    el.innerHTML = s;
  }
  return { instanceMap, gapChart, routes, convergence, num, esc, COLORS };
})();
if (typeof module !== 'undefined') module.exports = Charts;
