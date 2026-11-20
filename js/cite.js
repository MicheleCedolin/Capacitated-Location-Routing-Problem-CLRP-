// How to cite box. Hidden until data/cite.json has "show": true.
(async () => {
  const box = document.getElementById('cite'); if (!box) return;
  let c; try { c = await fetch('data/cite.json').then(r => r.json()); } catch (e) { return; }
  if (!c || !c.show) return;
  const esc = s => String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
  const au = (c.authors || []).join('; '), doi = c.doi ? 'https://doi.org/' + c.doi : '';
  const plain = `${au} (${c.year}). ${c.title}${c.version ? ' (version ' + c.version + ')' : ''} [Software]. ${doi || c.url}`;
  const key = ((c.authors || ['clrp'])[0].split(',')[0] + c.year).toLowerCase().replace(/[^a-z0-9]/g, '');
  const bib = `@software{${key},\n  author  = {${(c.authors || []).join(' and ')}},\n  title   = {${c.title}},\n  year    = {${c.year}},` +
    (c.version ? `\n  version = {${c.version}},` : '') + (c.doi ? `\n  doi     = {${c.doi}},` : '') + `\n  url     = {${c.url}}\n}`;
  box.innerHTML = `<h2 class="sec">How to cite</h2><p>If you use this solver in your work, please cite it:</p><p>${esc(plain)}</p>` +
    (c.paper ? `<p>Related article: ${esc(c.paper)}</p>` : '') +
    `<div class="eq" id="cite-bib">${esc(bib)}</div><p><button type="button" id="cite-copy">Copy BibTeX</button></p>`;
  box.hidden = false;
  document.getElementById('cite-copy').onclick = e => { navigator.clipboard && navigator.clipboard.writeText(bib).then(() => { e.target.textContent = 'Copied'; }); };
})();
