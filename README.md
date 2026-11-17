# CLRP Solver (browser edition)

A static web site with two pages:

- **Solver** (`index.html`): choose a benchmark instance (79 built in) or upload your own, choose one of 18 heuristics,
  a local-search driver and operators, and run several seeds in your browser. Results: cost components, gap to the
  best known value, route map, convergence, and downloads (CSV, log, best solution, settings).
- **Learn** (`learn.html`): the model (objective and constraints), file formats, the heuristic families with animations,
  the 18 local-search operators with before/after pictures, a matrix comparing the operators with the CLRP literature,
  and the reference list (DOIs checked against Crossref; entries not re-read are marked †).

The solver is the C++ engine of the CLRP lab application compiled to WebAssembly (`wasm/clrp.wasm`). It runs in a
Web Worker pool inside the visitor's browser; nothing is sent to a server.

## Layout

```
index.html  learn.html        the two pages (English)
css/site.css                  theme (light and dark)
js/engine*.js clrp-wasi.js    wasm loader, worker pool, in-memory WASI shim, CLI arguments, result parsing
js/app.js charts.js learn.js  Solver page, SVG charts, Learn page (built from data/*.json)
wasm/clrp.wasm                engine, wasm32-wasi
data/                         instances, catalog (heuristics, operators, parameters), literature, learn_map
tools/make_literature.py      writes data/literature.json and data/learn_map.json
tests/                        headless-browser and Node tests (not deployed)
.github/workflows/pages.yml   deploys the site to GitHub Pages
```

## Deploy

1. Create the repository (name `CLRP`) under your account and push this folder to `main`.
2. Settings → Pages → Source: **GitHub Actions**. The workflow publishes `index.html`, `learn.html`, `css`, `js`,
   `wasm` and `data` to `https://<account>.github.io/CLRP/`.
3. All paths are relative, so the site also works from any other sub-path or from a local static server
   (`python3 -m http.server`; opening the files with `file://` does not work because of `fetch`).

## Tests

```
python3 -m http.server 8765 &
python3 tests/ui_smoke.py       # Solver: 2 seeds x 3 s through the wasm worker pool
python3 tests/ui_learn.py       # Learn: no console errors, anchors, driver animation, phone width
python3 tests/ui_upload.py      # uploads (.dat, .json), invalid file, custom operator list
node tests/engine_sweep.js      # all 18 heuristics and option combinations in wasm
```

The UI tests use Playwright with Google Chrome. They were run on Linux with headless Chrome only; other browsers and
operating systems have not been tested.

## Notes for users and maintainers

- **Time-limited runs depend on the device.** The number of iterations done in a time limit depends on the speed of the
  visitor's device, so costs can differ between devices. Runs without a time limit are deterministic for a seed.
- **Depot layer `mip` is not offered:** the C++ engine has no MILP solver. Only `none` and `halving` are available.
- **BKS values are published snapshots,** not certified optima; negative gaps are possible. For the P set, the rounding
  of distances is documented differently from the HGAMP code (see `data/DATA_NOTICE.md`); the site rounds up.
- **Data and licence.** The licence of the code does not cover the instance data and reference values; read
  `data/DATA_NOTICE.md` and complete its checklist before making the repository public. No licence file is included
  here: add the licence you chose for the lab application.
- **Regenerating the data files.** `data/instances.json`, `data/instances/*.dat` and `data/catalog.json` come from the lab
  application kit (version in `catalog.json`, field `kit_version`); `tools/make_literature.py` regenerates the two
  literature files. After a change run the three tests above.
