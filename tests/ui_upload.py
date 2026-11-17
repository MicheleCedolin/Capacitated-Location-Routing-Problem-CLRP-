# Upload paths (.dat and .json) and a custom operator list through the wasm engine. usage: python3 tests/ui_upload.py [base_url]
import sys, json
from playwright.sync_api import sync_playwright
base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
errs = []
def run(pg, label):
    pg.fill('#nseeds', '1'); pg.fill('#tlim', '2'); pg.fill('#nwork', '1'); pg.dispatch_event('#tlim', 'input')
    pg.evaluate("document.getElementById('res').hidden = true")
    pg.click('#run'); pg.wait_for_function("document.getElementById('run').disabled === false && document.getElementById('res').hidden === false", timeout=60000)
    print(label, '|', pg.inner_text('#res-sum').split(' · ')[0:3], '| status', pg.inner_text('#res-table tbody tr').split('\t')[-1].strip(), '| err', repr(pg.inner_text('#run-err')))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1100, 'height': 900}); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(base + 'index.html'); pg.wait_for_selector('#inst-info:not(:empty)')
    pg.check('input[name=isrc][value=upload]')
    pg.set_input_files('#up-file', 'data/instances/' + json.load(open('data/instances.json'))[5]['file'])   # a built-in .dat as an upload
    pg.wait_for_function("document.getElementById('inst-info').textContent.length > 0"); print('dat info:', pg.inner_text('#inst-info'), '| err', repr(pg.inner_text('#up-err')))
    run(pg, 'upload .dat')
    with pg.expect_download() as d: pg.click('#up-example')
    d.value.save_as('/tmp/example_inst.json'); pg.set_input_files('#up-file', '/tmp/example_inst.json')
    pg.wait_for_function("document.getElementById('inst-info').textContent.includes('customers')"); print('json info:', pg.inner_text('#inst-info'))
    run(pg, 'upload .json')
    pg.set_input_files('#up-file', {'name': 'bad.json', 'mimeType': 'application/json', 'buffer': b'{"depots":[]}'}); pg.wait_for_timeout(300); print('bad json ->', pg.inner_text('#up-err'))
    # custom operator list
    pg.check('input[name=isrc][value=builtin]'); pg.wait_for_function("document.getElementById('inst-info').textContent.includes('best known')")
    pg.select_option('#ls-sel', 'vnd'); pg.click('#op-clear')
    for op in ['intra_2opt', 'inter_relocate1', 'inter_swap11']: pg.select_option('#op-add', op)
    print('chips:', pg.inner_text('#ops-chips').replace('\n', ' ')[:140])
    spec = pg.evaluate("JSON.stringify(window.CLRP.buildSpec ? window.CLRP.buildSpec() : null)"); print('spec ops:', json.loads(spec).get('operators') if spec != 'null' else spec)
    run(pg, 'custom ops (alias)')
    b.close()
print('console errors:', errs)
