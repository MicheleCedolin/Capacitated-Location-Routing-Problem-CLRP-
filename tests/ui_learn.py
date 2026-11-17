# Headless-browser test of the Learn page + cross-page anchors. usage: python3 tests/ui_learn.py [base_url]
import sys, re, json
from playwright.sync_api import sync_playwright
base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
errs = []; bad = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1100, 'height': 900})
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('requestfailed', lambda r: errs.append('REQFAIL ' + r.url))
    pg.goto(base + 'learn.html'); pg.wait_for_selector('#refs ol.refs'); pg.wait_for_timeout(1500)
    n = lambda sel: pg.eval_on_selector_all(sel, 'e => e.length')
    print('fig svg', n('#fig-problem svg'), '| data rows', n('#data-table tbody tr'), '| family anims', n('.anim svg'),
          '| fcards', n('.fcard'), '| opcards', n('.opcard'), '| ba svgs', n('.ba svg'), '| matrix rows', n('#matrix tbody tr'), '| refs', n('ol.refs li'))
    # every in-page link must hit an existing id
    ids = set(pg.eval_on_selector_all('[id]', 'e => e.map(x => x.id)'))
    for h in pg.eval_on_selector_all('a[href^="#"]', 'e => e.map(x => x.getAttribute("href").slice(1))'):
        if h not in ids: bad.append(h)
    print('broken in-page anchors:', sorted(set(bad)))
    # anchors the Solver page links to
    pg2 = b.new_page(); pg2.goto(base + 'index.html'); pg2.wait_for_selector('#inst-info:not(:empty)')
    cat = json.load(open('data/catalog.json')); need = {'problem', 'bks', 'formats'} | {'h-' + h['id'] for h in cat['heuristics']}
    for m in re.findall(r'learn\.html#([\w-]+)', open('index.html').read()): need.add(m)
    print('missing Solver->Learn anchors:', sorted(need - ids))
    # ?h= link
    pg2.goto(base + 'index.html?h=hgamp' if any(h['id']=='hgamp' for h in cat['heuristics']) else base + 'index.html?h=vns'); pg2.wait_for_selector('#inst-info:not(:empty)'); print('?h= ->', pg2.eval_on_selector('#heur-sel', 'e => e.value'))
    # driver animation: step through each driver until done
    for d in ['none', 'first', 'vnd', 'rvnd', 'best']:
        pg.select_option('#drv-sel', d)
        for _ in range(60):
            pg.click('#drv-step')
            if 'local optimum' in pg.inner_text('#drv-anim') or d == 'none' and 'No local search' in pg.inner_text('#drv-anim'): break
        print('driver', d, '->', pg.inner_text('#drv-anim').replace('\n', ' ')[-110:])
    pg.screenshot(path='/tmp/shots/learn_full.png', full_page=True)
    pg.set_viewport_size({'width': 390, 'height': 800}); pg.screenshot(path='/tmp/shots/learn_mobile.png', full_page=False)
    ov = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth'); print('mobile horizontal overflow px:', ov)
    b.close()
print('console errors:', errs)
