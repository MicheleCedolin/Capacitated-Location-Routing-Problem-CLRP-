# Headless-browser smoke test of the Solver page. usage: python3 tests/ui_smoke.py [base_url]
import sys, json, time
from playwright.sync_api import sync_playwright
base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1100, 'height': 900})
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(base + 'index.html'); pg.wait_for_selector('#inst-info:not(:empty)'); pg.click('#mode-expert')  # the page opens in Quick start
    print('info:', pg.inner_text('#inst-info'))
    pg.fill('#nseeds', '2'); pg.fill('#tlim', '3'); pg.fill('#nwork', '2'); pg.dispatch_event('#tlim', 'input')
    print('est:', pg.inner_text('#est'))
    pg.click('#run'); pg.wait_for_function("document.getElementById('run').disabled === false && document.getElementById('res').hidden === false", timeout=60000)
    print('status:', pg.inner_text('#status')); print('summary:', pg.inner_text('#res-sum'))
    rows = pg.eval_on_selector_all('#res-table tbody tr', 'els => els.map(e => e.innerText.replace(/\\t/g," | "))'); print('\n'.join(rows))
    print('run-err:', repr(pg.inner_text('#run-err')))
    print('svg counts', pg.eval_on_selector_all('#gap-chart svg, #route-chart svg, #conv-chart svg, #inst-map svg', 'e => e.length'))
    pg.screenshot(path='/tmp/shots/solver_full.png', full_page=True)
    b.close()
print('console errors:', errs)
