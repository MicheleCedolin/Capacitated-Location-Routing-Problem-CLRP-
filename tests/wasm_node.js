// Runs the web engine (wasm + in-memory WASI) under Node for a list of cases and prints one JSON line per case.
// usage: node tests/wasm_node.js <kit-root> <cases.json>      cases: [{name, instance, args:[...]}]
const fs = require('fs'), path = require('path');
const W = require('../js/clrp-wasi.js');
const [,, kit, casesFile] = process.argv;
const mod = new WebAssembly.Module(fs.readFileSync(path.join(__dirname, '../wasm/clrp.wasm')));
const reg = JSON.parse(fs.readFileSync(path.join(kit, 'reference/CLRP_reference.json'), 'utf8'));
(async () => {
  for (const c of JSON.parse(fs.readFileSync(casesFile, 'utf8'))) {
    const fam = c.instance.startsWith('coordP') || c.instance.startsWith('coord') && /^coord(20|50|100|200)-/.test(c.instance) ? 'P' : (/^coord(Christ|Gaspelle|Perl|Das)/.test(c.instance) ? 'B' : 'T');
    const rel = `data/${fam}/${c.instance}.dat`;
    const files = { [rel]: fs.readFileSync(path.join(kit, rel)), 'reference/CLRP_reference.json': fs.readFileSync(path.join(kit, 'reference/CLRP_reference.json')) };
    const t = Date.now();
    const r = await W.run(mod, { files, args: ['--kit-root', '/kit', '--instances', c.instance, '--out-dir', '/kit/res', ...c.args] });
    const csv = r.files['res/summary.csv'] ? Buffer.from(r.files['res/summary.csv']).toString() : '';
    console.log(JSON.stringify({ name: c.name, exit: r.exit, trapped: r.trapped, ms: Date.now() - t, stderr: r.stderr.slice(0, 300), csv, nfiles: Object.keys(r.files).length }));
  }
})();
